import type { Run } from "../../domain/run";
import type { StoragePort } from "./storage-port";

export interface RunStorePort extends StoragePort {
  save(run: Run): Promise<void>;
  get(runId: string): Promise<Run | undefined>;
  listByThread(threadId: string): Promise<Run[]>;
  getLatestByThread(threadId: string): Promise<Run | undefined>;
}
