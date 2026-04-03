import type { Event } from "../../domain/event";
import type { Task } from "../../domain/task";
import type { Thread } from "../../domain/thread";
import type { ApprovalRequest } from "../../domain/approval";
import type { RuntimeScope } from "./runtime-scope";
import { PROTOCOL_VERSION, type RuntimeSnapshot } from "./runtime-types";
import { getStoredEventSequence } from "./runtime-events";

export function buildRuntimeSnapshot(input: {
  scope: RuntimeScope;
  activeThread: Thread;
  threads: Thread[];
  tasks: Task[];
  pendingApprovals: ApprovalRequest[];
  events: Event[];
  fallbackLastEventSeq: number;
  narrativeSummary?: string;
}): RuntimeSnapshot {
  const activeBlockingReason = input.tasks.find((task) => task.status === "blocked" && task.blockingReason)?.blockingReason;
  const lastEventSeq = getStoredEventSequence(input.events.at(-1)) ?? input.fallbackLastEventSeq;

  return {
    protocolVersion: PROTOCOL_VERSION,
    workspaceRoot: input.scope.workspaceRoot,
    projectId: input.scope.projectId,
    lastEventSeq,
    activeThreadId: input.activeThread.threadId,
    recommendationReason: input.activeThread.recommendationReason,
    narrativeSummary: input.narrativeSummary,
    blockingReason: activeBlockingReason,
    threads: input.threads,
    tasks: input.tasks.map((task) => ({
      taskId: task.taskId,
      status: task.status,
      summary: task.summary ?? "",
      blockingReason: task.blockingReason,
    })),
    pendingApprovals: input.pendingApprovals.map((approval) => ({
      approvalRequestId: approval.approvalRequestId,
      summary: approval.summary,
      risk: approval.risk,
      status: approval.status,
    })),
    answers: input.events
      .filter((event) => event.type === "answer.updated")
      .map((event) => ({
        answerId: event.eventId,
        content: typeof event.payload?.summary === "string" ? event.payload.summary : "",
      })),
  };
}
