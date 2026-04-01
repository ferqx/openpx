export type TaskStatus = "queued" | "running" | "blocked" | "completed" | "failed" | "cancelled";

export type Task = {
  taskId: string;
  threadId: string;
  status: TaskStatus;
};

export function createTask(taskId: string, threadId: string): Task {
  return { taskId, threadId, status: "queued" };
}

export function transitionTask(task: Task, status: TaskStatus): Task {
  return { ...task, status };
}
