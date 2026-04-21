import type { ApprovalRequest } from "../../../domain/approval";
import type { AgentRunRecord } from "../../../domain/agent-run";
import type { Run } from "../../../domain/run";
import type { Task } from "../../../domain/task";
import type { Thread } from "../../../domain/thread";
import type { Event } from "../../../domain/event";
import { DEFAULT_THREAD_MODE } from "../../../control/agents/thread-mode";
import type { HarnessSessionScope } from "../../server/harness-session-scope";
import type { RuntimeSnapshot } from "../schemas/api-schema";
import type { PlanDecisionRequest } from "../../../runtime/planning/planner-result";
import { CURRENT_PROTOCOL_VERSION as PROTOCOL_VERSION } from "../schemas/protocol-version";
import { getStoredEventSequence } from "../events/runtime-event-envelope";
import { toAgentRunView } from "./agent-run-view";

/** thread 列表项的内部扩展视图：补充 active run 与阻塞摘要 */
type RuntimeThreadView = Thread & {
  activeRunId?: string;
  activeRunStatus?: Run["status"];
  pendingApprovalCount?: number;
  blockingReasonKind?: "waiting_approval" | "plan_decision" | "human_recovery";
};

/** 组装 runtime snapshot：把 thread/run/task/approval 等 durable 状态裁成协议视图 */
export function buildRuntimeSnapshot(input: {
  scope: HarnessSessionScope;
  activeThread?: Thread;
  activeRunId?: string;
  threads: RuntimeThreadView[];
  runs: Run[];
  tasks: Task[];
  pendingApprovals: ApprovalRequest[];
  agentRuns: AgentRunRecord[];
  events: Event[];
  fallbackLastEventSeq: number;
  narrativeSummary?: string;
  planDecision?: PlanDecisionRequest;
}): RuntimeSnapshot {
  const latestRun = input.runs.find((run) => run.runId === input.activeRunId);
  const canExposeBlockingReason =
    !latestRun
    || latestRun.status === "waiting_approval"
    || latestRun.status === "blocked"
    || latestRun.status === "failed"
    || latestRun.status === "interrupted";
  // 优先使用 thread recoveryFacts 中的阻塞原因；
  // 没有时再退回当前 blocked task 上的 blockingReason。
  // running run 上残留的 blockingReason 只代表旧暂停点，不能继续投影成当前阻塞。
  const activeBlockingReason = canExposeBlockingReason
    ? input.activeThread?.recoveryFacts?.blocking
      ? {
          kind: input.activeThread.recoveryFacts.blocking.kind,
          message: input.activeThread.recoveryFacts.blocking.message,
        }
      : input.tasks.find((task) => task.status === "blocked" && task.blockingReason)?.blockingReason
    : undefined;

  const narrativeSummary = input.activeThread?.narrativeState?.threadSummary || input.narrativeSummary;
  const latestAnswer = input.activeThread?.recoveryFacts?.latestDurableAnswer;
  const latestExecutionStatus =
    latestRun?.status === "completed"
      ? "completed" as const
      : latestRun?.status === "waiting_approval"
        ? "waiting_approval" as const
        : latestRun && ["blocked", "failed", "interrupted"].includes(latestRun.status)
          ? "blocked" as const
          : latestRun
            ? "running" as const
            : undefined;
  const pauseSummary = activeBlockingReason?.message;

  // 事件流恢复以持久层序号为准；没有序号时再回退到内存 liveSeq。
  const lastEventSeq = getStoredEventSequence(input.events.at(-1)) ?? input.fallbackLastEventSeq;

  return {
    protocolVersion: PROTOCOL_VERSION,
    workspaceRoot: input.scope.workspaceRoot,
    projectId: input.scope.projectId,
    lastEventSeq,
    activeThreadId: input.activeThread?.threadId,
    activeRunId: input.activeRunId,
    threadMode: input.activeThread?.threadMode ?? DEFAULT_THREAD_MODE,
    recommendationReason: input.activeThread?.recommendationReason,
    planDecision: input.planDecision,
    finalResponse: latestAnswer?.summary,
    pauseSummary,
    latestExecutionStatus,
    narrativeSummary,
    blockingReason: activeBlockingReason,
    threads: input.threads.map((thread) => {
      // thread 视图允许从线程列表里直接看到 active run 概览；
      // 若调用方没提前补齐，则在这里从 runs 中兜底推导。
      const latestRun = input.runs.filter((run) => run.threadId === thread.threadId).at(-1);
      return {
        threadId: thread.threadId,
        workspaceRoot: thread.workspaceRoot,
        projectId: thread.projectId,
        revision: thread.revision,
        status: thread.status,
        threadMode: thread.threadMode,
        activeRunId: thread.activeRunId ?? latestRun?.runId,
        activeRunStatus: thread.activeRunStatus ?? latestRun?.status,
        narrativeSummary: thread.narrativeSummary,
        narrativeRevision: thread.narrativeRevision,
        pendingApprovalCount: thread.pendingApprovalCount,
        blockingReasonKind: thread.blockingReasonKind,
      };
    }),
    runs: input.runs.map((run) => ({
      runId: run.runId,
      threadId: run.threadId,
      status: run.status,
      trigger: run.trigger,
      inputText: run.inputText,
      activeTaskId: run.activeTaskId,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      resultSummary: run.resultSummary,
      blockingReason: run.blockingReason,
      ledgerState: run.ledgerState,
      resumeToken: run.resumeToken,
    })),
    tasks: input.tasks.map((task) => ({
      taskId: task.taskId,
      threadId: task.threadId,
      runId: task.runId,
      status: task.status,
      summary: task.summary ?? "",
      blockingReason: task.blockingReason,
    })),
    pendingApprovals: input.pendingApprovals.map((approval) => ({
      approvalRequestId: approval.approvalRequestId,
      threadId: approval.threadId,
      runId: approval.runId,
      taskId: approval.taskId,
      toolCallId: approval.toolCallId,
      summary: approval.summary,
      risk: approval.risk,
      status: approval.status,
    })),
    // 当前 answers/messages 仍主要从 active thread 的 recoveryFacts 中恢复，
    // 这样 snapshot 不依赖完整原始消息历史也能给 TUI 提供稳定视图。
    answers: latestAnswer && input.activeThread
      ? [
          {
            answerId: latestAnswer.answerId,
            threadId: input.activeThread.threadId,
            content: latestAnswer.summary,
          },
        ]
      : [],
    messages: (input.activeThread?.recoveryFacts?.conversationHistory ?? []).map((message) => ({
      messageId: message.messageId,
      threadId: input.activeThread?.threadId ?? "",
      role: message.role,
      content: message.content,
    })),
    agentRuns: input.agentRuns.map((agentRun) => toAgentRunView(agentRun)),
  };
}
