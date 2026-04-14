import { runId as sharedRunId, taskId as sharedTaskId, threadId as sharedThreadId } from "../../shared/ids";

/** 控制面任务状态 */
export type ControlTaskStatus = "queued" | "running" | "blocked" | "completed" | "failed" | "cancelled";

/** ControlTask：控制面在运行期使用的轻量 task 视图 */
export type ControlTask = {
  taskId: ReturnType<typeof sharedTaskId>;
  threadId: ReturnType<typeof sharedThreadId>;
  runId: ReturnType<typeof sharedRunId>;
  summary: string;
  status: ControlTaskStatus;
  blockingReason?: {
    kind: "waiting_approval" | "human_recovery";
    message: string;
  };
};

/** taskStore 最小契约 */
export type TaskStoreContract = {
  save(task: ControlTask): Promise<void>;
};

/** 创建 ControlTask：自动补齐 runId 与默认状态 */
export function createControlTask(input: {
  taskId: string;
  threadId: string;
  runId?: string;
  summary: string;
  status?: ControlTaskStatus;
  blockingReason?: {
    kind: "waiting_approval" | "human_recovery";
    message: string;
  };
}): ControlTask {
  return {
    taskId: sharedTaskId(input.taskId),
    threadId: sharedThreadId(input.threadId),
    runId: sharedRunId(input.runId ?? input.taskId),
    summary: input.summary,
    status: input.status ?? "queued",
    blockingReason: input.blockingReason,
  };
}
