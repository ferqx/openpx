export type TaskStatus = "queued" | "running" | "blocked" | "completed" | "failed" | "cancelled";

export type Task = {
  taskId: string;
  threadId: string;
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
  return { taskId, threadId, status: "queued" };
}

export function transitionTask(task: Task, status: TaskStatus): Task {
  if (!allowedTaskTransitions[task.status].includes(status)) {
    throw new Error(`invalid task transition from ${task.status} to ${status}`);
  }

  return { ...task, status };
}
