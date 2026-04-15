/**
 * @module harness/core/thread/thread-registry
 * harness 协作线注册表（thread registry）。
 *
 * 它负责按 scope 解析当前活跃 thread，并在作用域内没有活跃 thread 时创建新的。
 */
import type { Thread } from "../../../domain/thread";
import type { ThreadStorePort } from "../../../persistence/ports/thread-store-port";

export type ThreadScope = {
  workspaceRoot: string;
  projectId: string;
};

export class ThreadRegistry {
  constructor(private readonly threadStore: ThreadStorePort) {}

  /** 解析作用域内当前活跃 thread；若没有则创建新的。 */
  async resolveActiveThread(scope: ThreadScope): Promise<Thread> {
    const latest = await this.threadStore.getLatest(scope);
    if (latest && latest.status !== "archived") {
      return latest;
    }

    return this.createThread(scope);
  }

  /** 创建并持久化新的活跃 thread。 */
  async createThread(scope: ThreadScope): Promise<Thread> {
    const thread: Thread = {
      threadId: `thread_${Date.now()}`,
      workspaceRoot: scope.workspaceRoot,
      projectId: scope.projectId,
      revision: 1,
      status: "active",
    };
    await this.threadStore.save(thread);
    return thread;
  }

  /** 列出作用域内全部 threads。 */
  async listThreads(scope: ThreadScope): Promise<Thread[]> {
    return this.threadStore.listByScope(scope);
  }
}
