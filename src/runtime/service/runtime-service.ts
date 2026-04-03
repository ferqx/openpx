import { createAppContext } from "../../app/bootstrap";
import type { RuntimeSnapshot, RuntimeCommand, RuntimeEventEnvelope } from "./runtime-types";
import { PROTOCOL_VERSION } from "./runtime-types";
import { resolve } from "node:path";

export type RuntimeServiceOptions = {
  dataDir: string;
  workspaceRoot: string;
  projectId?: string;
};

export interface RuntimeService {
  getSnapshot(): Promise<RuntimeSnapshot>;
  handleCommand(command: RuntimeCommand): Promise<void>;
  subscribeEvents(afterSeq?: number): AsyncIterable<RuntimeEventEnvelope>;
}

class LocalRuntimeService implements RuntimeService {
  private projectId: string;

  constructor(
    private context: Awaited<ReturnType<typeof createAppContext>>,
    private workspaceRoot: string,
    projectId?: string
  ) {
    this.projectId = projectId ?? resolve(workspaceRoot).split("/").pop() ?? "default-project";
  }

  async getSnapshot(): Promise<RuntimeSnapshot> {
    const thread = await this.context.stores.threadStore.getLatest() ?? await this.startInitialThread();
    const tasks = await this.context.stores.taskStore.listByThread(thread.threadId);
    const approvals = await this.context.stores.approvalStore.listPendingByThread(thread.threadId);
    const events = await this.context.stores.eventLog.listByThread(thread.threadId) as any[];
    
    return {
      protocolVersion: PROTOCOL_VERSION,
      workspaceRoot: this.workspaceRoot,
      projectId: this.projectId,
      lastEventSeq: events.length > 0 ? (events[events.length - 1].sequence ?? 0) : 0,
      activeThreadId: thread.threadId,
      recommendationReason: (thread as any).recommendationReason,
      threads: [thread],
      tasks: tasks.map(t => ({
        taskId: t.taskId,
        status: t.status,
        summary: t.summary ?? "",
      })),
      pendingApprovals: approvals.map(a => ({
        approvalRequestId: a.approvalRequestId,
        summary: a.summary,
        risk: a.risk,
        status: a.status,
      })),
      answers: events
        .filter(e => e.type === "answer.updated")
        .map(e => ({
          answerId: e.eventId,
          content: (e.payload as any)?.summary ?? "",
        })),
    };
  }

  private async startInitialThread() {
    const thread = {
      threadId: `thread_${Date.now()}`,
      workspaceRoot: this.workspaceRoot,
      projectId: this.projectId,
      revision: 1,
      status: "active" as const,
    };
    await this.context.stores.threadStore.save(thread);
    return thread;
  }

  async handleCommand(command: RuntimeCommand): Promise<void> {
    switch (command.kind) {
      case "add_task":
        await this.context.kernel.handleCommand({
          type: "submit_input",
          payload: { text: command.content }
        });
        break;
      case "approve":
        await this.context.kernel.handleCommand({
          type: "approve_request",
          payload: { approvalRequestId: command.approvalRequestId }
        });
        break;
      case "reject":
        await this.context.kernel.handleCommand({
          type: "reject_request",
          payload: { approvalRequestId: command.approvalRequestId }
        });
        break;
      // TODO: implement other commands (new_thread, switch_thread, continue)
      default:
        throw new Error(`Command ${command.kind} not implemented`);
    }
  }

  async *subscribeEvents(afterSeq: number = 0): AsyncIterable<RuntimeEventEnvelope> {
    const thread = await this.context.stores.threadStore.getLatest();
    if (!thread) return;

    // First, emit existing events afterSeq
    const existing = await this.context.stores.eventLog.listByThreadAfter(thread.threadId, afterSeq) as any[];
    for (const event of existing) {
      yield {
        protocolVersion: PROTOCOL_VERSION,
        seq: event.sequence ?? 0,
        event: event,
      };
    }

    // Then, subscribe to new events
    const queue: RuntimeEventEnvelope[] = [];
    let resolve: ((value: void) => void) | null = null;

    const unsubscribe = this.context.kernel.events.subscribe((event) => {
      // In a real implementation, we'd get the seq from the store after append
      // For now, we'll approximate or rely on the next poll/reconnect
      queue.push({
        protocolVersion: PROTOCOL_VERSION,
        seq: Date.now(), // Approximate seq for live events
        event: event,
      });
      if (resolve) {
        resolve();
        resolve = null;
      }
    });

    try {
      while (true) {
        while (queue.length > 0) {
          yield queue.shift()!;
        }
        await new Promise<void>((r) => { resolve = r; });
      }
    } finally {
      unsubscribe();
    }
  }
}

export async function createRuntimeService(options: RuntimeServiceOptions): Promise<RuntimeService> {
  const context = await createAppContext({
    dataDir: options.dataDir,
    workspaceRoot: options.workspaceRoot,
  });

  return new LocalRuntimeService(context, options.workspaceRoot, options.projectId);
}
