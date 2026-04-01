export type WorkerStatus = "created" | "starting" | "running" | "stopping" | "exited" | "failed";
export type WorkerRole = "planner" | "executor" | "verifier" | "memory_maintainer";

export type Worker = {
  workerId: string;
  threadId: string;
  ownerTaskId: string;
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
  return { ...input, status: "created" };
}
