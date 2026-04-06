import type { Event } from "../../domain/event";
import type { Task } from "../../domain/task";
import type { Thread } from "../../domain/thread";
import type { ApprovalRequest } from "../../domain/approval";
import type { WorkerRecord } from "../../control/workers/worker-types";
import type { RuntimeScope } from "./runtime-scope";
import { PROTOCOL_VERSION, type RuntimeSnapshot } from "./runtime-types";
import { getStoredEventSequence } from "./runtime-events";

type RuntimeThreadView = Thread & {
  pendingApprovalCount?: number;
  blockingReasonKind?: "waiting_approval" | "human_recovery";
};

export function buildRuntimeSnapshot(input: {
  scope: RuntimeScope;
  activeThread?: Thread;
  threads: RuntimeThreadView[];
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
    recommendationReason: input.activeThread?.recommendationReason,
    narrativeSummary,
    blockingReason: activeBlockingReason,
    threads: input.threads.map((thread) => ({
      threadId: thread.threadId,
      workspaceRoot: thread.workspaceRoot,
      projectId: thread.projectId,
      revision: thread.revision,
      status: thread.status,
      narrativeSummary: thread.narrativeSummary,
      narrativeRevision: thread.narrativeRevision,
      pendingApprovalCount: thread.pendingApprovalCount,
      blockingReasonKind: thread.blockingReasonKind,
    })),
    tasks: input.tasks.map((task) => ({
      taskId: task.taskId,
      threadId: task.threadId,
      status: task.status,
      summary: task.summary ?? "",
      blockingReason: task.blockingReason,
    })),
    pendingApprovals: input.pendingApprovals.map((approval) => ({
      approvalRequestId: approval.approvalRequestId,
      threadId: approval.threadId,
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
