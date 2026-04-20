import type { RuntimeSnapshot } from "../../../harness/protocol/schemas/api-schema";
import { DEFAULT_PRIMARY_AGENT_ID, type PrimaryAgentId } from "../../../control/agents/agent-spec";
import type { ThreadMode } from "../../../control/agents/thread-mode";
import type { PlanDecisionRequest } from "../../../runtime/planning/planner-result";

/** TUI 关注的会话阶段：把底层 runtime/run 状态压平成更易渲染的 UI 阶段 */
export type SessionStage = "idle" | "planning" | "awaiting_confirmation" | "executing" | "blocked";

/** TUI 消费的会话状态：由 runtime snapshot 归一化而来 */
export type RuntimeSessionState = {
  primaryAgent?: PrimaryAgentId;
  threadMode?: ThreadMode;
  status: "completed" | "waiting_approval" | "blocked";
  stage?: SessionStage;
  threadId?: string;
  finalResponse?: string;
  executionSummary?: string;
  verificationSummary?: string;
  pauseSummary?: string;
  tasks: RuntimeSnapshot["tasks"];
  approvals: RuntimeSnapshot["pendingApprovals"];
  answers: RuntimeSnapshot["answers"];
  messages?: RuntimeSnapshot["messages"];
  workers: RuntimeSnapshot["workers"];
  workspaceRoot: string;
  projectId: string;
  blockingReason?: RuntimeSnapshot["blockingReason"];
  recommendationReason?: string;
  planDecision?: PlanDecisionRequest;
  narrativeSummary?: string;
  threads: RuntimeSnapshot["threads"];
};

/** 把 thread 列表压成线程面板可直接显示的多行摘要 */
export function formatThreadListSummary(session: Pick<RuntimeSessionState, "threadId" | "threads">): string {
  const lines = session.threads.map((thread) =>
    [
      `${thread.threadId}${thread.threadId === session.threadId ? " (active)" : ""} [${thread.activeRunStatus ?? thread.status}]`,
      `mode:${thread.threadMode}`,
      thread.pendingApprovalCount ? `approval:${thread.pendingApprovalCount}` : undefined,
      thread.blockingReasonKind,
      thread.narrativeSummary,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" "),
  );

  return lines.length > 0 ? lines.join("\n") : "No threads available.";
}

/** 仅根据顶层 status 推导基础阶段，用于 UI 初始化或空态兜底 */
export function deriveBaseSessionStage(
  session: Pick<RuntimeSessionState, "status"> | undefined,
): Extract<SessionStage, "idle" | "awaiting_confirmation" | "blocked"> {
  if (session?.status === "waiting_approval") {
    return "awaiting_confirmation";
  }

  if (session?.status === "blocked") {
    return "blocked";
  }

  return "idle";
}

/** 从 runtime snapshot 推导 TUI 统一会话状态 */
export function deriveRuntimeSession(snapshot: RuntimeSnapshot): RuntimeSessionState {
  const activeRun = snapshot.activeRunId
    ? snapshot.runs.find((run) => run.runId === snapshot.activeRunId)
    : undefined;
  const canUseBlockingReason =
    !activeRun
    || activeRun.status === "waiting_approval"
    || activeRun.status === "blocked"
    || activeRun.status === "failed"
    || activeRun.status === "interrupted";
  let normalizedRunBlockingReason: RuntimeSessionState["blockingReason"];
  if (!canUseBlockingReason) {
    normalizedRunBlockingReason = undefined;
  } else if (activeRun?.blockingReason?.kind === "environment_block") {
    normalizedRunBlockingReason = {
      kind: "human_recovery",
      message: activeRun.blockingReason.message,
    };
  } else if (
    activeRun?.blockingReason?.kind === "waiting_approval" ||
    activeRun?.blockingReason?.kind === "plan_decision" ||
    activeRun?.blockingReason?.kind === "human_recovery"
  ) {
    normalizedRunBlockingReason = {
      kind: activeRun.blockingReason.kind,
      message: activeRun.blockingReason.message,
    };
  } else {
    normalizedRunBlockingReason = undefined;
  }
  // environment_block 目前在 TUI 统一折叠成 human_recovery，
  // 避免界面层再理解更多 runtime 内部阻塞细分类。
  // running run 上的阻塞原因如果存在，只能是上一轮暂停残留，不能禁用输入。
  const blockingReason =
    canUseBlockingReason
      ? normalizedRunBlockingReason
        ?? snapshot.blockingReason
        ?? snapshot.tasks.find((task) => task.status === "blocked" && task.blockingReason)?.blockingReason
      : undefined;
  const status =
    activeRun?.status === "waiting_approval"
      ? "waiting_approval"
      : activeRun?.status === "blocked" || activeRun?.status === "failed" || activeRun?.status === "interrupted"
        ? "blocked"
        : snapshot.pendingApprovals.length > 0
          ? "waiting_approval"
          : blockingReason
            ? "blocked"
            : "completed";
  const stage = status === "waiting_approval" ? "awaiting_confirmation" : status === "blocked" ? "blocked" : "idle";

  return {
    primaryAgent: DEFAULT_PRIMARY_AGENT_ID,
    threadMode: snapshot.threadMode,
    status,
    stage,
    threadId: snapshot.activeThreadId,
    finalResponse: snapshot.finalResponse ?? snapshot.answers.at(-1)?.content,
    executionSummary: snapshot.executionSummary,
    verificationSummary: snapshot.verificationSummary,
    pauseSummary: snapshot.pauseSummary ?? blockingReason?.message,
    tasks: snapshot.tasks,
    approvals: snapshot.pendingApprovals,
    answers: snapshot.answers,
    messages: snapshot.messages ?? [],
    workers: snapshot.workers,
    workspaceRoot: snapshot.workspaceRoot,
    projectId: snapshot.projectId,
    blockingReason,
    recommendationReason: snapshot.recommendationReason,
    planDecision: snapshot.planDecision,
    narrativeSummary: snapshot.narrativeSummary,
    threads: snapshot.threads,
  };
}
