import type { MemoryNamespace, MemoryRecord } from "../../domain/memory";
import type { StoragePort } from "./storage-port";

/** 记忆检索输入：按 query/thread 过滤并限制返回条数 */
export type MemorySearchInput = {
  query?: string;
  threadId?: string;
  limit: number;
};

/** 记忆存储端口：保存、查询 durable/project/thread 级记忆 */
export interface MemoryStorePort extends StoragePort {
  save(record: MemoryRecord): Promise<void>;
  get(memoryId: string): Promise<MemoryRecord | undefined>;
  search(namespace: MemoryNamespace, input: MemorySearchInput): Promise<MemoryRecord[]>;
}
