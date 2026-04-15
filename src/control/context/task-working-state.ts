/** 
 * @module control/context/task-working-state
 * 任务工作状态（task working state）。
 * 
 * 表示控制面中任务执行的临时工作状态，
 * 包括摘要、阻塞上下文和草稿区（scratch）。
 * 
 * 术语对照：working state=工作状态，scratch=草稿区，
 * blocking context=阻塞上下文
 */
import type { ControlTask, ControlTaskStatus } from "../tasks/task-types";

/** 任务工作状态——控制面中任务执行的临时状态 */
export type TaskWorkingState = {
  taskId: string;                 // 具体步骤标识
  threadId: string;               // 所属协作线标识
  summary: string;                // 步骤摘要
  status: ControlTaskStatus;       // 步骤状态
  blockingContext?: string;        // 阻塞上下文描述
  scratch: string[];              // 草稿区，保留最近的工作痕迹
};

/** 从控制面任务创建初始工作状态 */
export function createInitialTaskWorkingState(task: ControlTask): TaskWorkingState {
  return {
    taskId: task.taskId,
    threadId: task.threadId,
    summary: task.summary,
    status: task.status,
    scratch: [],
  };
}

/** 更新任务工作状态，草稿区保留最近 10 条 */
export function updateTaskWorkingState(
  state: TaskWorkingState,
  update: Partial<Omit<TaskWorkingState, "taskId" | "threadId">>,
): TaskWorkingState {
  return {
    ...state,
    ...update,
    // scratch 采用追加而非覆盖，保留最近工作痕迹，方便后续总结和阻塞恢复。
    scratch: update.scratch ? [...state.scratch, ...update.scratch].slice(-10) : state.scratch,  // 保留最近 10 条
  };
}
