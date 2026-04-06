import type { SpawnWorkerInput, WorkerRole } from "./worker-types";
import type { WorkerStatus } from "../../domain/worker";

export type WorkerRuntimeState = {
  status: WorkerStatus;
  startedAt?: string;
  endedAt?: string;
  resumeToken?: string;
};

export type WorkerRuntime = {
  start(): Promise<WorkerRuntimeState | void>;
  inspect(): Promise<WorkerRuntimeState>;
  resume(): Promise<WorkerRuntimeState>;
  cancel(): Promise<WorkerRuntimeState>;
  join(): Promise<WorkerRuntimeState>;
};

export type WorkerRuntimeContext = {
  workerId: string;
  role: WorkerRole;
  taskId: SpawnWorkerInput["taskId"];
  threadId: SpawnWorkerInput["threadId"];
  spawnReason: SpawnWorkerInput["spawnReason"];
};

export type WorkerRuntimeFactory = (input: WorkerRuntimeContext) => WorkerRuntime;
