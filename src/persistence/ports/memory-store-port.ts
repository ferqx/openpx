import type { MemoryNamespace, MemoryRecord } from "../../domain/memory";
import type { StoragePort } from "./storage-port";

export type MemorySearchInput = {
  query?: string;
  threadId?: string;
  limit: number;
};

export interface MemoryStorePort extends StoragePort {
  save(record: MemoryRecord): Promise<void>;
  get(memoryId: string): Promise<MemoryRecord | undefined>;
  search(namespace: MemoryNamespace, input: MemorySearchInput): Promise<MemoryRecord[]>;
}
