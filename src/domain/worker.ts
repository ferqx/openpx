import { taskId as sharedTaskId, threadId as sharedThreadId, workerId as sharedWorkerId } from "../shared/ids";

export type WorkerStatus = "created" | "starting" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type WorkerRole = "planner" | "executor" | "verifier" | "memory_maintainer";

export type Worker = {
  workerId: ReturnType<typeof sharedWorkerId>;
  threadId: ReturnType<typeof sharedThreadId>;
  ownerTaskId: ReturnType<typeof sharedTaskId>;
  role: WorkerRole;
  spawnReason: string;
  status: WorkerStatus;
};

export function createWorker(input: {
  workerId: string;
  threadId: string;
  ownerTaskId: string;
  role: WorkerRole;
  spawnReason: string;
}): Worker {
  return {
    workerId: sharedWorkerId(input.workerId),
    threadId: sharedThreadId(input.threadId),
    ownerTaskId: sharedTaskId(input.ownerTaskId),
    role: input.role,
    spawnReason: input.spawnReason,
    status: "created",
  };
}
