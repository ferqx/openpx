import { taskId as sharedTaskId, threadId as sharedThreadId } from "../../shared/ids";

export type ControlTaskStatus = "queued" | "running" | "blocked" | "completed" | "failed" | "cancelled";

export type ControlTask = {
  taskId: ReturnType<typeof sharedTaskId>;
  threadId: ReturnType<typeof sharedThreadId>;
  summary: string;
  status: ControlTaskStatus;
  blockingReason?: {
    kind: "waiting_approval" | "human_recovery";
    message: string;
  };
};

export type TaskStoreContract = {
  save(task: ControlTask): Promise<void>;
};

export function createControlTask(input: {
  taskId: string;
  threadId: string;
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
    summary: input.summary,
    status: input.status ?? "queued",
    blockingReason: input.blockingReason,
  };
}
