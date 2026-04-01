import type { SpawnWorkerInput, WorkerRole } from "./worker-types";

export type WorkerRuntime = {
  start(): Promise<void>;
};

export type WorkerRuntimeContext = {
  workerId: string;
  role: WorkerRole;
  taskId: SpawnWorkerInput["taskId"];
  threadId: SpawnWorkerInput["threadId"];
  spawnReason: SpawnWorkerInput["spawnReason"];
};

export type WorkerRuntimeFactory = (input: WorkerRuntimeContext) => WorkerRuntime;
