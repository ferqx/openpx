import type { Thread } from "../../domain/thread";
import type { StoragePort } from "./storage-port";

/** 协作线存储端口：负责 thread 的持久化读写与按 scope 检索 */
export interface ThreadStorePort extends StoragePort {
  save(thread: Thread): Promise<void>;
  get(threadId: string): Promise<Thread | undefined>;
  /** 返回作用域内最近更新的协作线；未传 scope 时返回全局最近一条 */
  getLatest(scope?: { workspaceRoot: string; projectId: string }): Promise<Thread | undefined>;
  /** 列出指定 workspace/project 下的全部协作线 */
  listByScope(scope: { workspaceRoot: string; projectId: string }): Promise<Thread[]>;
}
