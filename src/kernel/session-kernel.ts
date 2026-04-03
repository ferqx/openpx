import { createEventBus, type KernelEvent } from "./event-bus";
import { createInterruptService } from "./interrupt-service";
import { createThreadService } from "./thread-service";
import { transitionThread } from "../domain/thread";
import { createEvent } from "../domain/event";
import type { ApprovalRequest } from "../domain/approval";
import type { Task } from "../domain/task";
import type { ThreadStorePort } from "../persistence/ports/thread-store-port";
import type { TaskStorePort } from "../persistence/ports/task-store-port";
import type { EventLogPort } from "../persistence/ports/event-log-port";
import { prefixedUuid } from "../shared/id-generators";

export type SubmitInputCommand = {
  type: "submit_input";
  payload: {
    text: string;
    background?: boolean;
  };
};

export type ApproveRequestCommand = {
  type: "approve_request";
  payload: {
    approvalRequestId: string;
  };
};

export type RejectRequestCommand = {
  type: "reject_request";
  payload: {
    approvalRequestId: string;
  };
};

export type SessionCommand = SubmitInputCommand | ApproveRequestCommand | RejectRequestCommand;

export type SessionControlPlaneResult = {
  status: "completed" | "waiting_approval" | "blocked";
  task: Task;
  approvals: ApprovalRequest[];
  summary: string;
};

export type SessionCommandResult = {
  status: SessionControlPlaneResult["status"];
  threadId: string;
  summary: string;
  tasks: Task[];
  approvals: ApprovalRequest[];
};

export type SessionKernel = {
  events: ReturnType<typeof createEventBus<KernelEvent>>;
  interrupts: ReturnType<typeof createInterruptService<KernelEvent>>;
  handleCommand: (command: SessionCommand, expectedRevision?: number) => Promise<SessionCommandResult>;
  hydrateSession: () => Promise<SessionCommandResult | undefined>;
};

export function createSessionKernel(deps: {
  stores: {
    threadStore: ThreadStorePort;
    taskStore: TaskStorePort;
    approvalStore: {
      listPendingByThread(threadId: string): Promise<ApprovalRequest[]>;
    };
    eventLog?: EventLogPort;
  };
  controlPlane: {
    startRootTask: (threadId: string, text: string) => Promise<SessionControlPlaneResult>;
    approveRequest: (approvalRequestId: string) => Promise<SessionControlPlaneResult>;
    rejectRequest: (approvalRequestId: string) => Promise<SessionControlPlaneResult>;
  };
  workspaceRoot?: string;
  projectId?: string;
}): SessionKernel {
  const events = createEventBus<KernelEvent>();
  const threadService = createThreadService({
    threadStore: deps.stores.threadStore,
    events,
    workspaceRoot: deps.workspaceRoot,
    projectId: deps.projectId,
  });
  const interrupts = createInterruptService({ events });

  async function checkRevision(threadId: string, expectedRevision?: number) {
    if (expectedRevision === undefined) return;
    const thread = await deps.stores.threadStore.get(threadId);
    if (thread && thread.revision !== expectedRevision) {
      throw new Error(`stale thread revision: expected ${expectedRevision} but found ${thread.revision}`);
    }
  }

  async function incrementRevision(threadId: string) {
    const thread = await deps.stores.threadStore.get(threadId);
    if (thread) {
      const nextThread = { ...thread, revision: (thread.revision ?? 1) + 1 };
      await deps.stores.threadStore.save(nextThread);
      return nextThread;
    }
    return undefined;
  }

  async function persistAnswerUpdated(result: SessionCommandResult): Promise<void> {
    if (!deps.stores.eventLog) {
      return;
    }

    await deps.stores.eventLog.append(
      createEvent({
        eventId: prefixedUuid("event"),
        threadId: result.threadId,
        taskId: result.tasks[0]?.taskId,
        type: "answer.updated",
        payload: {
          threadId: result.threadId,
          status: result.status,
          summary: result.summary,
        },
      }),
    );
  }

  async function appendRuntimeEvent(input: {
    threadId: string;
    taskId?: string;
    type: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    if (!deps.stores.eventLog) {
      return;
    }

    await deps.stores.eventLog.append(
      createEvent({
        eventId: prefixedUuid("event"),
        threadId: input.threadId,
        taskId: input.taskId,
        type: input.type,
        payload: input.payload,
      }),
    );
  }

  async function hydrateThread(threadId: string): Promise<SessionCommandResult> {
    const tasks = await deps.stores.taskStore.listByThread(threadId);
    const approvals = await deps.stores.approvalStore.listPendingByThread(threadId);
    const loggedEvents = deps.stores.eventLog ? await deps.stores.eventLog.listByThread(threadId) : [];
    const blockedTask = tasks.find((task) => task.status === "blocked");
    const lastAnswer = [...loggedEvents]
      .reverse()
      .find((event) => event.type === "answer.updated" && typeof event.payload?.summary === "string");

    return {
      status: approvals.length > 0 ? "waiting_approval" : blockedTask ? "blocked" : "completed",
      threadId,
      summary: blockedTask?.blockingReason?.message ??
        (typeof lastAnswer?.payload?.summary === "string" ? lastAnswer.payload.summary : undefined) ??
        tasks.at(-1)?.summary ??
        approvals[0]?.summary ??
        "Awaiting answer",
      tasks,
      approvals,
    };
  }

  async function finalize(threadId: string, result: SessionControlPlaneResult): Promise<SessionCommandResult> {
    const currentThread = await incrementRevision(threadId);
    if (!currentThread) {
      throw new Error(`missing thread ${threadId}`);
    }

    const targetStatus =
      result.status === "waiting_approval"
        ? "waiting_approval"
        : result.status === "blocked"
          ? "blocked"
          : "completed";
    const nextThread = currentThread.status === targetStatus ? currentThread : transitionThread(currentThread, targetStatus);
    await deps.stores.threadStore.save(nextThread);

    const threadEventType =
      result.status === "waiting_approval"
        ? "thread.waiting_approval"
        : result.status === "blocked"
          ? "thread.blocked"
          : "thread.completed";
    const threadEventPayload =
      result.status === "blocked"
        ? {
            threadId: nextThread.threadId,
            status: nextThread.status,
            blockingReason: result.task?.blockingReason,
          }
        : nextThread;

    events.publish({
      type: threadEventType,
      payload: threadEventPayload,
    });
    await appendRuntimeEvent({
      threadId: nextThread.threadId,
      type: threadEventType,
      payload: threadEventPayload as Record<string, unknown>,
    });
    if (result.task) {
      events.publish({
        type: "task.updated",
        payload: result.task,
      });
      await appendRuntimeEvent({
        threadId: nextThread.threadId,
        taskId: result.task.taskId,
        type: "task.updated",
        payload: result.task as unknown as Record<string, unknown>,
      });
    }
    for (const approval of result.approvals) {
      events.publish({
        type: "approval.pending",
        payload: approval,
      });
      await appendRuntimeEvent({
        threadId: nextThread.threadId,
        taskId: approval.taskId,
        type: "approval.pending",
        payload: approval as unknown as Record<string, unknown>,
      });
    }

    const commandResult = {
      status: result.status,
      threadId: nextThread.threadId,
      summary: result.summary,
      tasks: result.task ? [result.task] : [],
      approvals: result.approvals,
    } satisfies SessionCommandResult;

    if (deps.stores.eventLog) {
      await deps.stores.eventLog.append({
        eventId: `event_${crypto.randomUUID()}`,
        threadId: nextThread.threadId,
        type: "answer.updated",
        payload: { summary: result.summary },
        createdAt: new Date().toISOString(),
      });
    }

    events.publish({
      type: "answer.updated",
      payload: {
        threadId: nextThread.threadId,
        status: result.status,
        summary: result.summary,
      },
    });
    await persistAnswerUpdated(commandResult);

    return commandResult;
  }

  return {
    events,
    interrupts,
    async hydrateSession() {
      const latestThread = await deps.stores.threadStore.getLatest();
      if (!latestThread) {
        return undefined;
      }

      return hydrateThread(latestThread.threadId);
    },
    async handleCommand(command, expectedRevision) {
      if (command.type === "submit_input") {
        const latestThread = await deps.stores.threadStore.getLatest();
        if (latestThread?.status === "waiting_approval") {
          await checkRevision(latestThread.threadId, expectedRevision);
          
          if (command.payload.background) {
            // Background resume: don't await finalize
            void deps.controlPlane.startRootTask(latestThread.threadId, command.payload.text)
              .then(result => finalize(latestThread.threadId, result))
              .catch(err => console.error("Background task failed", err));
            
            const tasks = await deps.stores.taskStore.listByThread(latestThread.threadId);
            return {
              threadId: latestThread.threadId,
              status: "active" as any, // "running" basically
              summary: "Task started in background",
              tasks,
              approvals: [],
            };
          }

          // Instead of just hydrating, resume the graph with the new input
          const result = await deps.controlPlane.startRootTask(latestThread.threadId, command.payload.text);
          return finalize(latestThread.threadId, result);
        }

        if (latestThread?.status === "blocked") {
          await checkRevision(latestThread.threadId, expectedRevision);
          return hydrateThread(latestThread.threadId);
        }

        const thread = await threadService.startThread();
        
        if (command.payload.background) {
          // Background start: don't await startRootTask or finalize
          void deps.controlPlane.startRootTask(thread.threadId, command.payload.text)
            .then(result => finalize(thread.threadId, result))
            .catch(err => console.error("Background task failed", err));
          
          return {
            status: "active" as any,
            threadId: thread.threadId,
            summary: "Task started in background",
            tasks: [],
            approvals: [],
          };
        }

        const result =
          (await deps.controlPlane.startRootTask(thread.threadId, command.payload.text)) ??
          ({
            status: "completed",
            task: undefined,
            approvals: [],
            summary: command.payload.text,
          } satisfies {
            status: SessionControlPlaneResult["status"];
            task?: Task;
            approvals: SessionControlPlaneResult["approvals"];
            summary: string;
          });

        return finalize(thread.threadId, result as SessionControlPlaneResult);
      }

      if (command.type === "approve_request") {
        // Need to find threadId for approval
        const approval = await (deps.stores.approvalStore as any).get(command.payload.approvalRequestId);
        if (approval) {
          await checkRevision(approval.threadId, expectedRevision);
        }
        const result = await deps.controlPlane.approveRequest(command.payload.approvalRequestId);
        return finalize(result.task.threadId, result);
      }

      if (command.type === "reject_request") {
        const approval = await (deps.stores.approvalStore as any).get(command.payload.approvalRequestId);
        if (approval) {
          await checkRevision(approval.threadId, expectedRevision);
        }
        const result = await deps.controlPlane.rejectRequest(command.payload.approvalRequestId);
        return finalize(result.task.threadId, result);
      }

      throw new Error(`no command handler registered for ${(command as { type: string }).type}`);
    },
  };
}
