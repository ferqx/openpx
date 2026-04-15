import type { Run } from "../../domain/run";
import type { StoragePort } from "./storage-port";

/** run 存储端口：按 runId 读写，并支持按 thread 回放 run 历史 */
export interface RunStorePort extends StoragePort {
  save(run: Run): Promise<void>;
  get(runId: string): Promise<Run | undefined>;
  listByThread(threadId: string): Promise<Run[]>;
  getLatestByThread(threadId: string): Promise<Run | undefined>;
}
