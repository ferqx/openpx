import { createEvent } from "../../domain/event";
import type { ControlTask, TaskStoreContract } from "./task-types";
import { createControlTask } from "./task-types";
import { prefixedUuid } from "../../shared/id-generators";

export type TaskManager = {
  createRootTask(threadId: string, summary: string, runId?: string): Promise<ControlTask>;
};

async function appendTaskCreatedEvent(deps: {
  eventLog?: {
    append(event: ReturnType<typeof createEvent>): Promise<void>;
  };
}, task: ControlTask): Promise<void> {
  if (!deps.eventLog) {
    return;
  }

  try {
    await deps.eventLog.append(
      createEvent({
        eventId: prefixedUuid("event"),
        threadId: task.threadId,
        taskId: task.taskId,
        type: "task.created",
        payload: {
          taskId: task.taskId,
          summary: task.summary,
          status: task.status,
        },
      }),
    );
  } catch {
    return;
  }
}

export function createTaskManager(deps: {
  taskStore: TaskStoreContract;
  eventLog?: {
    append(event: ReturnType<typeof createEvent>): Promise<void>;
  };
}): TaskManager {
  return {
    async createRootTask(threadId: string, summary: string, runId?: string) {
      const task = createControlTask({
        taskId: prefixedUuid("task"),
        threadId,
        runId,
        summary,
      });

      await deps.taskStore.save(task);
      await appendTaskCreatedEvent(deps, task);

      return task;
    },
  };
}
