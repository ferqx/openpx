import type { Thread } from "../../domain/thread";
import type { StoragePort } from "./storage-port";

export interface ThreadStorePort extends StoragePort {
  save(thread: Thread): Promise<void>;
  get(threadId: string): Promise<Thread | undefined>;
  getLatest(scope?: { workspaceRoot: string; projectId: string }): Promise<Thread | undefined>;
}
