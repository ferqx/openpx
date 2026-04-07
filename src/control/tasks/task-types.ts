import { runId as sharedRunId, taskId as sharedTaskId, threadId as sharedThreadId } from "../../shared/ids";

export type ControlTaskStatus = "queued" | "running" | "blocked" | "completed" | "failed" | "cancelled";

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

export type TaskStoreContract = {
  save(task: ControlTask): Promise<void>;
};

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
