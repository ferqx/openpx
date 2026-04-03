import type { ControlTask, ControlTaskStatus } from "../tasks/task-types";

export type TaskWorkingState = {
  taskId: string;
  threadId: string;
  summary: string;
  status: ControlTaskStatus;
  blockingContext?: string;
  scratch: string[];
};

export function createInitialTaskWorkingState(task: ControlTask): TaskWorkingState {
  return {
    taskId: task.taskId,
    threadId: task.threadId,
    summary: task.summary,
    status: task.status,
    scratch: [],
  };
}

export function updateTaskWorkingState(
  state: TaskWorkingState,
  update: Partial<Omit<TaskWorkingState, "taskId" | "threadId">>,
): TaskWorkingState {
  return {
    ...state,
    ...update,
    scratch: update.scratch ? [...state.scratch, ...update.scratch] : state.scratch,
  };
}
