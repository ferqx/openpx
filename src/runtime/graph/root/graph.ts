import { END, START, StateGraph } from "@langchain/langgraph";
import type { InteractionIntent, RootGraphContext } from "./context";
import { RootState } from "./state";
import { routeNode } from "./nodes/route";
import { postTurnGuardNode } from "./nodes/post-turn-guard";
import { approvalGateNode } from "./nodes/approval-gate";
import { intakeNormalizeNode } from "./nodes/intake-normalize";
import { phaseCommitNode } from "./nodes/phase-commit";
import { createPlannerWorkerGraph } from "../../workers/planner/graph";
import { createVerifierWorkerGraph } from "../../workers/verifier/graph";
import type { ResumeControl } from "./resume-control";
import type { WorkPackage } from "../../planning/work-package";
import type { ArtifactRecord } from "../../artifacts/artifact-index";

function deriveInteractionIntent(input: {
  normalizedGoal: string;
  resumeValue?: string | ResumeControl;
}): InteractionIntent {
  if (input.resumeValue && typeof input.resumeValue !== "string") {
    return "resume_approval";
  }

  if (/^\s*(verify|verification)\b/i.test(input.normalizedGoal)) {
    return "verification_request";
  }

  return "user_request";
}

function buildSystemFallbackFinalResponse(state: {
  input: string;
  executionSummary?: string;
  verificationSummary?: string;
  artifacts?: ArtifactRecord[];
  latestArtifacts?: ArtifactRecord[];
}) {
  const artifactSummary = [...(state.artifacts ?? []), ...(state.latestArtifacts ?? [])]
    .map((artifact) => artifact.summary.trim())
    .filter((value) => value.length > 0)
    .join("; ");
  const parts = [
    state.executionSummary?.trim(),
    state.verificationSummary?.trim(),
    artifactSummary || undefined,
  ].filter((value): value is string => Boolean(value && value.length > 0));

  return parts.length > 0 ? parts.join("\n") : `Completed request: ${state.input}`;
}

/** 解析当前 work package；未显式指定时回退到第一个待办包 */
function resolveCurrentWorkPackage(state: {
  workPackages?: WorkPackage[];
  currentWorkPackageId?: string;
}) {
  const workPackages = state.workPackages ?? [];
  const currentWorkPackageId = state.currentWorkPackageId ?? workPackages[0]?.id;
  return workPackages.find((item) => item.id === currentWorkPackageId);
}

/** 只收集当前 work package 的 artifact，避免前一包的结果污染当前验证 */
function resolveArtifactsForCurrentWorkPackage(state: {
  currentWorkPackageId?: string;
  artifacts?: ArtifactRecord[];
  latestArtifacts?: ArtifactRecord[];
}) {
  const currentWorkPackageId = state.currentWorkPackageId;
  if (!currentWorkPackageId) {
    return [];
  }

  return [...(state.artifacts ?? []), ...(state.latestArtifacts ?? [])].filter(
    (artifact) => artifact.workPackageId === currentWorkPackageId,
  );
}

/** 创建根图：把 intake -> route -> planner/executor/verifier/approval/commit 串成主循环 */
export async function createRootGraph(context: RootGraphContext) {
  const plannerGraph = await createPlannerWorkerGraph(context.planner);
  const verifierGraph = await createVerifierWorkerGraph(context.verifier);

  const graph = new StateGraph(RootState)
    .addNode("intake", async (state, config) => {
      const threadId = config.configurable?.thread_id as string | undefined;
      const view = threadId && context.getThreadView ? await context.getThreadView(threadId) : undefined;
      
      let input = state.input;
      let nextResumeValue: string | ResumeControl | undefined;
      // 纯字符串 resumeValue 主要来自 interrupt 后的人类文本输入；
      // 若只是 yes/approve 之类确认词，不覆盖原始 input。
      if (typeof state.resumeValue === "string") {
        const resumeText = state.resumeValue.toLowerCase();
        const isConfirmation = /\b(yes|ok|approve|confirm|start|proceed)\b/.test(resumeText);
        if (!isConfirmation) {
          input = state.resumeValue;
        }
      } else if (state.resumeValue) {
        nextResumeValue = state.resumeValue;
        const resumeControl = state.resumeValue as ResumeControl;
        // 对拒绝审批路径，把 rejection reason 作为新一轮 planner 输入。
        if (resumeControl.kind === "approval_resolution" && resumeControl.decision === "rejected" && resumeControl.reason) {
          input = resumeControl.reason;
        }
      }

      const normalizedInput = intakeNormalizeNode({ input: input.trim() }).normalizedInput;
      const interactionIntent = deriveInteractionIntent({
        normalizedGoal: normalizedInput.goal,
        resumeValue: state.resumeValue,
      });

      return {
        input: normalizedInput.goal,
        interactionIntent,
        resumeValue: nextResumeValue,
        // 如有持久化 thread view，则把压缩后的恢复状态重新注入根图。
        ...(view ? {
          recoveryFacts: view.recoveryFacts,
          narrativeState: view.narrativeState,
          workingSetWindow: view.workingSetWindow,
        } : {})
      };
    })
    .addNode("router", routeNode)
    .addNode("approval-gate", approvalGateNode)
    .addNode("phase-commit", phaseCommitNode)
    .addNode("planner", async (state, config) => {
      return plannerGraph.invoke({ input: state.input }, config);
    })
    .addNode("responder", async (state, config) => {
      if (!context.responder) {
        return {
          finalResponse: buildSystemFallbackFinalResponse(state),
          finalResponseSource: "system_fallback" as const,
          mode: "done" as const,
          route: "finish" as const,
        };
      }
      // responder 负责生成真正的最终回答。
      const result = await context.responder({
        input: state.input,
        threadId: config.configurable?.thread_id as string | undefined,
        taskId: config.configurable?.task_id as string | undefined,
        artifacts: [...(state.artifacts ?? []), ...(state.latestArtifacts ?? [])],
        plannerResult: state.plannerResult,
        verificationReport: state.verificationReport,
        configurable: config.configurable,
      });
      return {
        finalResponse: result.finalResponse ?? buildSystemFallbackFinalResponse(state),
        finalResponseSource: result.finalResponseSource ?? "responder",
        mode: "done" as const,
        route: "finish" as const,
      };
    })
    .addNode("executor", (state, config) => {
      const currentWorkPackage = resolveCurrentWorkPackage(state);
      return context.executor({
        input: state.input,
        threadId: config.configurable?.thread_id as string | undefined,
        taskId: config.configurable?.task_id as string | undefined,
        currentWorkPackage,
        artifacts: resolveArtifactsForCurrentWorkPackage(state),
        plannerResult: state.plannerResult,
        verificationReport: state.verificationReport,
        approvedApprovalRequestId: state.approvedApprovalRequestId,
        configurable: config.configurable,
      });
    })
    .addNode("verifier", async (state, config) => {
      const currentWorkPackage = resolveCurrentWorkPackage(state);
      // verifier 只看当前包的 artifact，避免跨包验证串味。
      const result = await verifierGraph.invoke(
        {
          input: state.input,
          currentWorkPackage,
          artifacts: resolveArtifactsForCurrentWorkPackage(state),
          plannerResult: state.plannerResult,
        },
        config,
      );
      const legacySummary =
        typeof (result as unknown as { summary?: unknown }).summary === "string"
          ? (result as unknown as { summary: string }).summary
          : undefined;
      const verificationSummary =
        result.verificationSummary
        ?? legacySummary
        ?? result.feedback
        ?? "";
      return {
        verificationSummary,
        verifierPassed: result.isValid,
        verifierFeedback: result.feedback,
        verificationReport: {
          summary: verificationSummary,
          passed: result.isValid,
          feedback: result.feedback,
        },
      };
    })
    .addNode("post-turn-guard", postTurnGuardNode)
    .addNode("compact", (state, config) => {
      if (context.compactionPolicy && state.compactionTrigger) {
        const view = {
          recoveryFacts: state.recoveryFacts,
          narrativeState: state.narrativeState,
          workingSetWindow: state.workingSetWindow,
        };
        const nextView = context.compactionPolicy.compact(view, {
          trigger: state.compactionTrigger,
        });
        return {
          recoveryFacts: nextView.recoveryFacts,
          narrativeState: nextView.narrativeState,
          workingSetWindow: nextView.workingSetWindow,
          compactionTrigger: undefined,
        };
      }
      return {};
    })
    .addEdge(START, "intake")
    .addEdge("intake", "router")
    .addConditionalEdges("router", (state) => {
      // router 只做模式分流，不在这里修改业务数据。
      switch (state.mode) {
        case "plan":
          return "planner";
        case "respond":
          return "responder";
        case "verify":
          return "verifier";
        case "waiting_approval":
          return "approval-gate";
        case "done":
          return END;
        default:
          return "executor";
      }
    })
    .addConditionalEdges("planner", (state) => {
      // planner 只要产出了 work packages，就回到 router 让后续继续推进。
      if ((state.workPackages?.length ?? 0) > 0) {
        return "router";
      }
      return END;
    })
    .addEdge("responder", END)
    .addConditionalEdges("approval-gate", (state) => {
      switch (state.mode) {
        case "execute":
          return "executor";
        case "plan":
          return "planner";
        default:
          return END;
      }
    })
    .addConditionalEdges("verifier", (state) => {
      // verifier 失败时回 router，由 routeNode 负责把失败反馈改写进下一轮执行输入。
      if (state.verifierPassed === false) {
        return "router";
      }
      return "phase-commit";
    })
    .addConditionalEdges("phase-commit", (state) => {
      // 还有剩余包就继续 execute；全部提交完成则进入 responder。
      if (state.mode === "execute") {
        return "executor";
      }
      if (state.mode === "respond") {
        return "responder";
      }
      return END;
    })
    .addEdge("executor", "post-turn-guard")
    .addConditionalEdges("post-turn-guard", (state) => {
      if (state.compactionTrigger) return "compact";
      if (state.mode === "execute" && !state.finalResponse) return "router";
      if (state.mode === "done") return END;
      return END; 
    })
    .addEdge("compact", END);

  return graph.compile({
    checkpointer: context.checkpointer,
  });
}
