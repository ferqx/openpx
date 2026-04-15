import type { Worker } from "../../domain/worker";
import type { StoragePort } from "./storage-port";

/** worker 存储端口：保存 worker，并支持按 thread 查询当前活跃 worker */
export interface WorkerStorePort extends StoragePort {
  save(worker: Worker): Promise<void>;
  get(workerId: string): Promise<Worker | undefined>;
  listByThread(threadId: string): Promise<Worker[]>;
  listActiveByThread(threadId: string): Promise<Worker[]>;
}
