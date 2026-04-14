/** 
 * @module kernel/thread-registry
 * 协作线注册表（thread registry）。
 * 
 * 管理协作线的作用域解析和创建，确保每个 workspace+project 组合
 * 只有一个活跃协作线。当现有协作线归档时自动创建新的。
 * 
 * 术语对照：registry=注册表，scope=作用域，thread=协作线
 */
import type { ThreadStorePort } from "../persistence/ports/thread-store-port";
import type { Thread } from "../domain/thread";

/** 协作线作用域——workspaceRoot + projectId 唯一确定一个作用域 */
export type ThreadScope = {
  workspaceRoot: string;   // 工作区根路径
  projectId: string;        // 项目标识
};

/** 协作线注册表——管理作用域内的协作线生命周期 */
export class ThreadRegistry {
  constructor(private threadStore: ThreadStorePort) {}

  /** 解析作用域内的活跃协作线，不存在或已归档时创建新的 */
  async resolveActiveThread(scope: ThreadScope): Promise<Thread> {
    const latest = await this.threadStore.getLatest(scope);  // 获取最新协作线
    if (latest && latest.status !== "archived") {
      return latest;
    }

    // 如果作用域内没有活跃协作线，创建新的
    return this.createThread(scope);
  }

  /** 创建新协作线并持久化 */
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

  /** 列出作用域内所有协作线 */
  async listThreads(scope: ThreadScope): Promise<Thread[]> {
    return this.threadStore.listByScope(scope);
  }
}
