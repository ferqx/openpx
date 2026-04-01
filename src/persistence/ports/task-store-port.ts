import type { Task } from "../../domain/task";
import type { StoragePort } from "./storage-port";

export interface TaskStorePort extends StoragePort {
  save(task: Task): Promise<void>;
  get(taskId: string): Promise<Task | undefined>;
  listByThread(threadId: string): Promise<Task[]>;
}
