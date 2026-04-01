import { taskId as sharedTaskId, threadId as sharedThreadId, workerId as sharedWorkerId } from "../../shared/ids";

export type WorkerRole = "planner" | "executor" | "verifier" | "memory_maintainer";
export type WorkerStatus = "created" | "starting" | "running" | "stopping" | "exited" | "failed";

export type WorkerRecord = {
  workerId: ReturnType<typeof sharedWorkerId>;
  taskId: ReturnType<typeof sharedTaskId>;
  threadId: ReturnType<typeof sharedThreadId>;
  role: WorkerRole;
  spawnReason: string;
  status: WorkerStatus;
};

export type SpawnWorkerInput = {
  role: WorkerRole;
  taskId: string;
  threadId: string;
  spawnReason: string;
};

export function createWorkerRecord(input: {
  workerId: string;
  taskId: string;
  threadId: string;
  role: WorkerRole;
  spawnReason: string;
  status?: WorkerStatus;
}): WorkerRecord {
  return {
    workerId: sharedWorkerId(input.workerId),
    taskId: sharedTaskId(input.taskId),
    threadId: sharedThreadId(input.threadId),
    role: input.role,
    spawnReason: input.spawnReason,
    status: input.status ?? "created",
  };
}
