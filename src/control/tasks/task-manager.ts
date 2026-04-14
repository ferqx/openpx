import { createEvent } from "../../domain/event";
import type { ControlTask, TaskStoreContract } from "./task-types";
import { createControlTask } from "./task-types";
import { prefixedUuid } from "../../shared/id-generators";

/** task manager 对外能力：当前只暴露 root task 创建 */
export type TaskManager = {
  createRootTask(threadId: string, summary: string, runId?: string): Promise<ControlTask>;
};

/** 追加 task.created 事件；事件写失败时不影响主流程 */
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

/** 创建 task manager：负责创建 root task 并写入事件日志 */
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
