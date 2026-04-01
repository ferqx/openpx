import { domainError } from "../shared/errors";
import { taskId as sharedTaskId, threadId as sharedThreadId } from "../shared/ids";
import { taskStatusSchema } from "../shared/schemas";

export type TaskStatus = typeof taskStatusSchema._type;

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
  if (!allowedTaskTransitions[task.status].includes(status)) {
    throw domainError(`invalid task transition from ${task.status} to ${status}`);
  }

  return { ...task, status };
}
