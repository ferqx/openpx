import type { StoragePort } from "./storage-port";

export type MemoryNamespace = readonly string[];

export type MemoryEntry = {
  namespace: string[];
  key: string;
  value: unknown;
};

export type MemorySearchInput = {
  query?: string;
  limit: number;
};

export interface MemoryStorePort extends StoragePort {
  put(namespace: MemoryNamespace, key: string, value: unknown): Promise<void>;
  get(namespace: MemoryNamespace, key: string): Promise<MemoryEntry | undefined>;
  search(namespace: MemoryNamespace, input: MemorySearchInput): Promise<MemoryEntry[]>;
}
