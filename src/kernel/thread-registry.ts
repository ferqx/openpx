import type { ThreadStorePort } from "../persistence/ports/thread-store-port";
import type { Thread } from "../domain/thread";

export type ThreadScope = {
  workspaceRoot: string;
  projectId: string;
};

export class ThreadRegistry {
  constructor(private threadStore: ThreadStorePort) {}

  async resolveActiveThread(scope: ThreadScope): Promise<Thread> {
    const latest = await this.threadStore.getLatest(scope);
    if (latest && (latest.status === "active" || latest.status === "waiting_approval" || latest.status === "blocked")) {
      return latest;
    }

    // If no active thread in scope, create a new one
    return this.createThread(scope);
  }

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

  async listThreads(scope: ThreadScope): Promise<Thread[]> {
    return this.threadStore.listByScope(scope);
  }
}
