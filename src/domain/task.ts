import { domainError } from "../shared/errors";
import { taskId as sharedTaskId, threadId as sharedThreadId } from "../shared/ids";
import { taskStatusSchema } from "../shared/schemas";
import { z } from "zod";

export type TaskStatus = z.infer<typeof taskStatusSchema>;

export type Task = {
  taskId: ReturnType<typeof sharedTaskId>;
  threadId: ReturnType<typeof sharedThreadId>;
  status: TaskStatus;
};

const allowedTaskTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  queued: ["running", "blocked", "completed", "failed", "cancelled"],
  running: ["blocked", "completed", "failed", "cancelled"],
  blocked: ["running", "completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function createTask(taskId: string, threadId: string): Task {
  return { taskId: sharedTaskId(taskId), threadId: sharedThreadId(threadId), status: "queued" };
}

export function transitionTask(task: Task, status: TaskStatus): Task {
  const allowedStatuses = allowedTaskTransitions[task.status] ?? [];

  if (!allowedStatuses.includes(status)) {
    throw domainError(`invalid task transition from ${task.status} to ${status}`);
  }

  return { ...task, status };
}
