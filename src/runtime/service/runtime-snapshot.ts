import type { Event } from "../../domain/event";
import type { Run } from "../../domain/run";
import type { Task } from "../../domain/task";
import type { Thread } from "../../domain/thread";
import type { ApprovalRequest } from "../../domain/approval";
import type { WorkerRecord } from "../../control/workers/worker-types";
import type { RuntimeScope } from "./runtime-scope";
import { PROTOCOL_VERSION, type RuntimeSnapshot } from "./runtime-types";
import { getStoredEventSequence } from "./runtime-events";

/** thread 列表项的内部扩展视图：补充 active run 与阻塞摘要 */
type RuntimeThreadView = Thread & {
  activeRunId?: string;
  activeRunStatus?: Run["status"];
  pendingApprovalCount?: number;
  blockingReasonKind?: "waiting_approval" | "human_recovery";
};

/** 组装 runtime snapshot：把 thread/run/task/approval 等 durable 状态裁成协议视图 */
export function buildRuntimeSnapshot(input: {
  scope: RuntimeScope;
  activeThread?: Thread;
  activeRunId?: string;
  threads: RuntimeThreadView[];
  runs: Run[];
  tasks: Task[];
  pendingApprovals: ApprovalRequest[];
  workers: WorkerRecord[];
  events: Event[];
  fallbackLastEventSeq: number;
  narrativeSummary?: string;
}): RuntimeSnapshot {
  // 优先使用 thread recoveryFacts 中的阻塞原因；
  // 没有时再退回当前 blocked task 上的 blockingReason。
  const activeBlockingReason = input.activeThread?.recoveryFacts?.blocking
    ? {
        kind: input.activeThread.recoveryFacts.blocking.kind,
        message: input.activeThread.recoveryFacts.blocking.message,
      }
    : input.tasks.find((task) => task.status === "blocked" && task.blockingReason)?.blockingReason;

  const narrativeSummary = input.activeThread?.narrativeState?.threadSummary || input.narrativeSummary;

  // 事件流恢复以持久层序号为准；没有序号时再回退到内存 liveSeq。
  const lastEventSeq = getStoredEventSequence(input.events.at(-1)) ?? input.fallbackLastEventSeq;

  return {
    protocolVersion: PROTOCOL_VERSION,
    workspaceRoot: input.scope.workspaceRoot,
    projectId: input.scope.projectId,
    lastEventSeq,
    activeThreadId: input.activeThread?.threadId,
    activeRunId: input.activeRunId,
    recommendationReason: input.activeThread?.recommendationReason,
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
    answers: input.activeThread?.recoveryFacts?.latestDurableAnswer
      ? [
          {
            answerId: input.activeThread.recoveryFacts.latestDurableAnswer.answerId,
            threadId: input.activeThread.threadId,
            content: input.activeThread.recoveryFacts.latestDurableAnswer.summary,
          },
        ]
      : [],
    messages: (input.activeThread?.recoveryFacts?.conversationHistory ?? []).map((message) => ({
      messageId: message.messageId,
      threadId: input.activeThread?.threadId ?? "",
      role: message.role,
      content: message.content,
    })),
    workers: input.workers.map((worker) => ({
      workerId: worker.workerId,
      threadId: worker.threadId,
      taskId: worker.taskId,
      role: worker.role,
      status: worker.status,
      spawnReason: worker.spawnReason,
      startedAt: worker.startedAt,
      endedAt: worker.endedAt,
      resumeToken: worker.resumeToken,
    })),
  };
}
