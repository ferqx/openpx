import type { Task } from "../../domain/task";
import type { StoragePort } from "./storage-port";

/** 任务存储端口：按 taskId 读写，并支持按 thread 聚合查询 */
export interface TaskStorePort extends StoragePort {
  save(task: Task): Promise<void>;
  get(taskId: string): Promise<Task | undefined>;
  listByThread(threadId: string): Promise<Task[]>;
}
