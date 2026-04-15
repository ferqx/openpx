/** 
 * @module control/context/root-state-hydrator
 * 根状态水合器（root state hydrator）。
 * 
 * 从压缩后的协作线投影视图中恢复 LangGraph 根状态，
 * 包括环境一致性校验、恢复上下文注入和初始模式推导。
 * 
 * 术语对照：hydrate=水合/回填，root state=根状态，
 * recovery facts=恢复事实，working set=工作集窗口
 */
import type { DerivedThreadView, RecoveryFacts, NarrativeState, WorkingSetWindow } from "./thread-compaction-types";
import { EnvironmentService } from "./environment-service";

/** 水合选项 */
export type HydrationOptions = {
  workspaceRoot: string;
  currentCwd: string;
};

/**
 * 从压缩后的协作线投影视图水合（恢复）LangGraph 根状态。
 */
export function hydrateRootState(view: DerivedThreadView, options: HydrationOptions) {
  const recoveryFacts = view.recoveryFacts;
  if (!recoveryFacts) {
    throw new Error("Cannot hydrate root state without recovery facts");
  }

  const narrativeState = view.narrativeState ?? createEmptyNarrative();  // 叙事状态，缺失时创建空状态
  const workingSet = view.workingSetWindow ?? createEmptyWorkingSet();  // 工作集窗口，缺失时创建空窗口
  const envService = new EnvironmentService(options.workspaceRoot);  // 创建环境服务用于一致性校验

  // 这里产出的 messages 不是普通聊天记录，而是“恢复执行所需的系统上下文”；
  // 目标是在 raw history 已被压缩后，仍能把关键恢复事实重新喂回 graph。
  const contextualMessages = [
    `SYSTEM: Thread context restored (Revision: ${recoveryFacts.revision}).`,
    `Current Goal: ${recoveryFacts.activeTask?.summary ?? "Awaiting next task."}`,
    `Previous Progress: ${narrativeState.threadSummary}`,
  ];

  // 1. 环境一致性校验——检测 git HEAD 和 CWD 偏移
  if (recoveryFacts.environment) {
    const alignment = envService.verifyAlignment(recoveryFacts.environment, options.currentCwd);
    if (!alignment.aligned) {
      contextualMessages.push(
        `WARNING: Environmental Drift Detected! ${alignment.reason}. The agent should verify the current project state before proceeding.`
      );
    }
  }

  // 2. 待处理工具调用恢复——从潜在崩溃中恢复
  if (recoveryFacts.ledgerState?.pendingToolCallId) {
    contextualMessages.push(
      `CRITICAL: Recovery from potential crash. Tool call ${recoveryFacts.ledgerState.pendingToolCallId} was pending. VERIFY the effect on disk before re-running.`
    );
  }

  // 3. 阻塞状态恢复
  if (recoveryFacts.blocking) {
    contextualMessages.push(
      `STATUS: BLOCKED. Reason: ${recoveryFacts.blocking.kind} - ${recoveryFacts.blocking.message}`
    );
  }

  // 4. 待审批恢复
  if (recoveryFacts.pendingApprovals.length > 0) {
    contextualMessages.push(
      `PENDING APPROVALS: ${recoveryFacts.pendingApprovals.map(a => a.summary).join(", ")}`
    );
  }

  return {
    recoveryFacts: { ...recoveryFacts },
    narrativeState: { ...narrativeState },
    messages: [
      ...contextualMessages,
      ...(workingSet.messages ?? [])
    ],
    revision: recoveryFacts.revision,
    lastEventSeq: recoveryFacts.resumeAnchor?.lastEventSeq ?? 0,
    mode: deriveInitialMode(recoveryFacts),
    status: recoveryFacts.status,
  };
}

/** 创建空的叙事状态 */
function createEmptyNarrative(): NarrativeState {
  return {
    revision: 0,
    threadSummary: "",
    taskSummaries: [],
    openLoops: [],
    notableEvents: [],
    updatedAt: new Date().toISOString()
  };
}

/** 创建空的工作集窗口 */
function createEmptyWorkingSet(): WorkingSetWindow {
  return {
    revision: 0,
    messages: [],
    toolResults: [],
    verifierFeedback: [],
    retrievedMemories: [],
    updatedAt: new Date().toISOString()
  };
}

/** 根据恢复事实推导初始执行模式 */
function deriveInitialMode(facts: RecoveryFacts): "plan" | "execute" | "verify" | "done" | "waiting_approval" {
  // 初始模式推导尽量保守：只在确实能继续时回 execute，
  // 否则优先退回 plan，让 graph 重新确认接下来的动作。
  if (facts.blocking?.kind === "waiting_approval") return "waiting_approval";  // 等待审批
  if (facts.activeTask?.status === "blocked") return "plan"; // 非审批原因的阻塞，重新规划
  if (facts.activeTask?.status === "running") return "execute";  // 正在执行，继续
  return "plan";
}
