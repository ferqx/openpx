import type { WorkerRole } from "./worker-types";

export type WorkerRuntime = {
  start(): Promise<void>;
};

export type WorkerRuntimeFactory = (input: { role: WorkerRole }) => WorkerRuntime;
