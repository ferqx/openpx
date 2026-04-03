import { createAppContext } from "../../app/bootstrap";
import { createThread, transitionThread, type Thread } from "../../domain/thread";
import { createRuntimeCommandHandler } from "./runtime-command-handler";
import { createRuntimeEventEnvelope, getStoredEventSequence, mapStoredEventToEnvelope } from "./runtime-events";
import { buildRuntimeSnapshot } from "./runtime-snapshot";
import type { RuntimeScope } from "./runtime-scope";
import type { RuntimeCommand, RuntimeEventEnvelope, RuntimeSnapshot } from "./runtime-types";

type AppContext = Awaited<ReturnType<typeof createAppContext>>;

export class RuntimeScopedSession {
  private readonly eventBuffer: RuntimeEventEnvelope[] = [];
  private readonly maxBufferSize = 100;
  private liveSeq = 0;
  private activeThreadId?: string;
  private readonly commandHandler: (command: RuntimeCommand) => Promise<void>;

  constructor(
    readonly scope: RuntimeScope,
    readonly context: AppContext,
  ) {
    this.commandHandler = createRuntimeCommandHandler({
      scope: this.scope,
      context: this.context,
      ensureActiveThread: () => this.ensureActiveThread(),
      touchThread: (thread, nextStatus) => this.touchThread(thread, nextStatus),
      setActiveThreadId: (threadId) => {
        this.activeThreadId = threadId;
      },
    });

    this.context.kernel.events.subscribe((event) => {
      const envelope = createRuntimeEventEnvelope({
        seq: ++this.liveSeq,
        event,
      });

      this.eventBuffer.push(envelope);
      if (this.eventBuffer.length > this.maxBufferSize) {
        this.eventBuffer.shift();
      }
    });
  }

  private async ensureActiveThread(): Promise<Thread> {
    if (this.activeThreadId) {
      const active = await this.context.stores.threadStore.get(this.activeThreadId);
      if (active && active.workspaceRoot === this.scope.workspaceRoot && active.projectId === this.scope.projectId) {
        return active;
      }
    }

    const existing = await this.context.stores.threadStore.getLatest(this.scope);
    if (existing) {
      this.activeThreadId = existing.threadId;
      return existing;
    }

    const thread = createThread(crypto.randomUUID(), this.scope.workspaceRoot, this.scope.projectId);
    await this.context.stores.threadStore.save(thread);
    this.activeThreadId = thread.threadId;
    return thread;
  }

  private async syncLiveSeqWithEventLog(): Promise<void> {
    const threads = await this.context.stores.threadStore.listByScope(this.scope);
    if (threads.length === 0) {
      return;
    }

    const sequences = await Promise.all(
      threads.map(async (thread) => {
        const events = await this.context.stores.eventLog.listByThread(thread.threadId);
        return getStoredEventSequence(events.at(-1)) ?? 0;
      }),
    );

    this.liveSeq = Math.max(this.liveSeq, ...sequences);
  }

  private async touchThread(thread: Thread, nextStatus?: Thread["status"]): Promise<Thread> {
    const updated =
      nextStatus && thread.status !== nextStatus ? transitionThread(thread, nextStatus) : thread;
    await this.context.stores.threadStore.save(updated);
    this.activeThreadId = updated.threadId;
    return updated;
  }

  async getSnapshot(): Promise<RuntimeSnapshot> {
    const activeThread = await this.ensureActiveThread();
    await this.syncLiveSeqWithEventLog();
    const threads = await this.context.stores.threadStore.listByScope(this.scope);
    const tasks = await this.context.stores.taskStore.listByThread(activeThread.threadId);
    const pendingApprovals = await this.context.stores.approvalStore.listPendingByThread(activeThread.threadId);
    const events = await this.context.stores.eventLog.listByThread(activeThread.threadId);

    return buildRuntimeSnapshot({
      scope: this.scope,
      activeThread,
      threads,
      tasks,
      pendingApprovals,
      events,
      fallbackLastEventSeq: this.liveSeq,
    });
  }

  async handleCommand(command: RuntimeCommand): Promise<void> {
    await this.commandHandler(command);
  }

  async *subscribeEvents(afterSeq = 0): AsyncIterable<RuntimeEventEnvelope> {
    const activeThread = await this.ensureActiveThread();
    await this.syncLiveSeqWithEventLog();
    const buffered = this.eventBuffer.filter((envelope) => envelope.seq > afterSeq);

    for (const envelope of buffered) {
      yield envelope;
    }

    if (buffered.length === 0) {
      const existing = await this.context.stores.eventLog.listByThreadAfter(activeThread.threadId, afterSeq);
      this.liveSeq = Math.max(this.liveSeq, getStoredEventSequence(existing.at(-1)) ?? 0);
      for (const event of existing) {
        yield mapStoredEventToEnvelope({
          event,
          fallbackSeq: ++this.liveSeq,
        });
      }
    }

    const queue: RuntimeEventEnvelope[] = [];
    let resolveNext: (() => void) | null = null;

    const unsubscribe = this.context.kernel.events.subscribe((event) => {
      const envelope = createRuntimeEventEnvelope({
        seq: ++this.liveSeq,
        event,
      });
      queue.push(envelope);
      resolveNext?.();
      resolveNext = null;
    });

    try {
      while (true) {
        while (queue.length > 0) {
          yield queue.shift()!;
        }

        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
    } finally {
      unsubscribe();
    }
  }
}
