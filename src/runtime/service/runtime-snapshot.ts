import type { Event } from "../../domain/event";
import type { Run } from "../../domain/run";
import type { Task } from "../../domain/task";
import type { Thread } from "../../domain/thread";
import type { ApprovalRequest } from "../../domain/approval";
import type { WorkerRecord } from "../../control/workers/worker-types";
import type { RuntimeScope } from "./runtime-scope";
import { PROTOCOL_VERSION, type RuntimeSnapshot } from "./runtime-types";
import { getStoredEventSequence } from "./runtime-events";

type RuntimeThreadView = Thread & {
  activeRunId?: string;
  activeRunStatus?: Run["status"];
  pendingApprovalCount?: number;
  blockingReasonKind?: "waiting_approval" | "human_recovery";
};

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
  const activeBlockingReason = input.activeThread?.recoveryFacts?.blocking
    ? {
        kind: input.activeThread.recoveryFacts.blocking.kind,
        message: input.activeThread.recoveryFacts.blocking.message,
      }
    : input.tasks.find((task) => task.status === "blocked" && task.blockingReason)?.blockingReason;

  const narrativeSummary = input.activeThread?.narrativeState?.threadSummary || input.narrativeSummary;

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
