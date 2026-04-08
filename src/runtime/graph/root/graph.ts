import { END, START, StateGraph } from "@langchain/langgraph";
import type { RootGraphContext } from "./context";
import { RootState } from "./state";
import { routeNode } from "./nodes/route";
import { postTurnGuardNode } from "./nodes/post-turn-guard";
import { approvalGateNode } from "./nodes/approval-gate";
import { intakeNormalizeNode } from "./nodes/intake-normalize";
import { phaseCommitNode } from "./nodes/phase-commit";
import { createPlannerWorkerGraph } from "../../workers/planner/graph";
import { createExecutorWorkerGraph } from "../../workers/executor/graph";
import { createVerifierWorkerGraph } from "../../workers/verifier/graph";
import type { ResumeControl } from "./resume-control";
import type { WorkPackage } from "../../planning/work-package";
import type { ArtifactRecord } from "../../artifacts/artifact-index";

function resolveCurrentWorkPackage(state: {
  workPackages?: WorkPackage[];
  currentWorkPackageId?: string;
}) {
  const workPackages = state.workPackages ?? [];
  const currentWorkPackageId = state.currentWorkPackageId ?? workPackages[0]?.id;
  return workPackages.find((item) => item.id === currentWorkPackageId);
}

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

export async function createRootGraph(context: RootGraphContext) {
  const plannerGraph = await createPlannerWorkerGraph(context.planner);
  const executorGraph = await createExecutorWorkerGraph(context.executor);
  const verifierGraph = await createVerifierWorkerGraph(context.verifier);

  const graph = new StateGraph(RootState)
    .addNode("intake", async (state, config) => {
      const threadId = config.configurable?.thread_id as string | undefined;
      const view = threadId && context.getThreadView ? await context.getThreadView(threadId) : undefined;
      
      let input = state.input;
      let nextResumeValue: string | ResumeControl | undefined;
      if (typeof state.resumeValue === "string") {
        const resumeText = state.resumeValue.toLowerCase();
        const isConfirmation = /\b(yes|ok|approve|confirm|start|proceed)\b/.test(resumeText);
        if (!isConfirmation) {
          input = state.resumeValue;
        }
      } else if (state.resumeValue) {
        nextResumeValue = state.resumeValue;
        const resumeControl = state.resumeValue as ResumeControl;
        if (resumeControl.kind === "approval_resolution" && resumeControl.decision === "rejected" && resumeControl.reason) {
          input = resumeControl.reason;
        }
      }

      const normalizedInput = intakeNormalizeNode({ input: input.trim() }).normalizedInput;

      return {
        input: normalizedInput.goal,
        resumeValue: nextResumeValue,
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
        return { summary: state.input, mode: "done" };
      }
      const result = await context.responder({
        input: state.input,
        threadId: config.configurable?.thread_id as string | undefined,
        taskId: config.configurable?.task_id as string | undefined,
        configurable: config.configurable,
      });
      return {
        summary: result.summary,
        mode: "done" as const,
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
        configurable: config.configurable,
      });
    })
    .addNode("verifier", async (state, config) => {
      const currentWorkPackage = resolveCurrentWorkPackage(state);
      const result = await verifierGraph.invoke(
        {
          input: state.input,
          currentWorkPackage,
          artifacts: resolveArtifactsForCurrentWorkPackage(state),
          plannerResult: state.plannerResult,
        },
        config,
      );
      return {
        summary: result.summary,
        verifierPassed: result.isValid,
        verifierFeedback: result.feedback,
        verificationReport: {
          summary: result.summary,
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
      if (state.verifierPassed === false) {
        return "router";
      }
      return "phase-commit";
    })
    .addConditionalEdges("phase-commit", (state) => {
      if (state.mode === "execute") {
        return "executor";
      }
      return END;
    })
    .addEdge("executor", "post-turn-guard")
    .addConditionalEdges("post-turn-guard", (state) => {
      if (state.compactionTrigger) return "compact";
      if (state.mode === "done") return END;
      return END; 
    })
    .addEdge("compact", END);

  return graph.compile({
    checkpointer: context.checkpointer,
  });
}
