import { createEventBus, type KernelEvent } from "./event-bus";
import { createInterruptService } from "./interrupt-service";
import { createThreadService } from "./thread-service";
import { transitionThread } from "../domain/thread";
import type { ApprovalRequest } from "../domain/approval";
import type { Task } from "../domain/task";
import type { ThreadStorePort } from "../persistence/ports/thread-store-port";

export type SubmitInputCommand = {
  type: "submit_input";
  payload: {
    text: string;
  };
};

export type SessionCommand = SubmitInputCommand;

export type SessionControlPlaneResult = {
  status: "completed" | "waiting_approval";
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
  handleCommand: (command: SessionCommand) => Promise<SessionCommandResult>;
};

export function createSessionKernel(deps: {
  stores: {
    threadStore: ThreadStorePort;
  };
  controlPlane: {
    startRootTask: (threadId: string, text: string) => Promise<SessionControlPlaneResult | void>;
  };
}): SessionKernel {
  const events = createEventBus<KernelEvent>();
  const threadService = createThreadService({
    threadStore: deps.stores.threadStore,
    events,
  });
  const interrupts = createInterruptService({ events });

  return {
    events,
    interrupts,
    async handleCommand(command) {
      if (command.type !== "submit_input") {
        throw new Error(`no command handler registered for ${command.type}`);
      }

      const thread = await threadService.startThread();
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
      const nextThread = transitionThread(thread, result.status === "waiting_approval" ? "waiting_approval" : "completed");
      await deps.stores.threadStore.save(nextThread);

      events.publish({
        type: result.status === "waiting_approval" ? "thread.waiting_approval" : "thread.completed",
        payload: nextThread,
      });
      if (result.task) {
        events.publish({
          type: "task.updated",
          payload: result.task,
        });
      }
      for (const approval of result.approvals) {
        events.publish({
          type: "approval.pending",
          payload: approval,
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

      return {
        status: result.status,
        threadId: nextThread.threadId,
        summary: result.summary,
        tasks: result.task ? [result.task] : [],
        approvals: result.approvals,
      };
    },
  };
}
