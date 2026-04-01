import { createEvent } from "../../domain/event";
import type { ControlTask, TaskStoreContract } from "./task-types";
import { createControlTask } from "./task-types";

export type TaskManager = {
  createRootTask(threadId: string, summary: string): Promise<ControlTask>;
};

export function createTaskManager(deps: {
  taskStore: TaskStoreContract;
  eventLog?: {
    append(event: ReturnType<typeof createEvent>): Promise<void>;
  };
}): TaskManager {
  return {
    async createRootTask(threadId: string, summary: string) {
      const task = createControlTask({
        taskId: `task_${Date.now()}`,
        threadId,
        summary,
      });

      await deps.taskStore.save(task);

      if (deps.eventLog) {
        await deps.eventLog.append(
          createEvent({
            eventId: `event_${Date.now()}`,
            threadId,
            taskId: task.taskId,
            type: "task.created",
            payload: {
              taskId: task.taskId,
              summary: task.summary,
              status: task.status,
            },
          }),
        );
      }

      return task;
    },
  };
}
