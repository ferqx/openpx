import type { Worker } from "../../domain/worker";
import type { StoragePort } from "./storage-port";

export interface WorkerStorePort extends StoragePort {
  save(worker: Worker): Promise<void>;
  get(workerId: string): Promise<Worker | undefined>;
  listByThread(threadId: string): Promise<Worker[]>;
  listActiveByThread(threadId: string): Promise<Worker[]>;
}
