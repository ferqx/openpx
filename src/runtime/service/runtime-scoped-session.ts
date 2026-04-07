import { createAppContext } from "../../app/bootstrap";
import { createThread, transitionThread, type Thread } from "../../domain/thread";
import { createRuntimeCommandHandler } from "./runtime-command-handler";
import { createRuntimeEventEnvelope, getStoredEventSequence, mapStoredEventToEnvelope } from "./runtime-events";
import { buildRuntimeSnapshot } from "./runtime-snapshot";
import type { RuntimeScope } from "./runtime-scope";
import type { RuntimeCommand, RuntimeEventEnvelope, RuntimeSnapshot } from "./runtime-types";
import type { SessionCommandResult } from "../../kernel/session-kernel";

type AppContext = Awaited<ReturnType<typeof createAppContext>>;

export class RuntimeScopedSession {
  private readonly eventBuffer: RuntimeEventEnvelope[] = [];
  private readonly maxBufferSize = 100;
  private liveSeq = 0;
  private activeThreadId?: string;
  private readonly commandHandler: (command: RuntimeCommand) => Promise<SessionCommandResult>;

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

    this.context.kernel.events.subscribeStream((event) => {
      const envelope = createRuntimeEventEnvelope({
        seq: ++this.liveSeq,
        event: { type: event.type, payload: event.payload },
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

  private async getExistingActiveThread(): Promise<Thread | undefined> {
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

    return undefined;
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
    if (this.activeThreadId && this.activeThreadId !== thread.threadId) {
      const previous = await this.context.stores.threadStore.get(this.activeThreadId);
      if (previous && previous.workspaceRoot === this.scope.workspaceRoot && previous.projectId === this.scope.projectId && previous.status === "active") {
        await this.context.stores.threadStore.save({
          ...transitionThread(previous, "idle"),
          revision: (previous.revision ?? 1) + 1,
        });
      }
    }

    const targetStatus = nextStatus ?? thread.status;
    const updated =
      thread.status !== targetStatus ? transitionThread(thread, targetStatus) : thread;
    await this.context.stores.threadStore.save(updated);
    this.activeThreadId = updated.threadId;
    return updated;
  }

  async getSnapshot(): Promise<RuntimeSnapshot> {
    const activeThread = await this.getExistingActiveThread();
    await this.syncLiveSeqWithEventLog();
    const threads = await this.context.stores.threadStore.listByScope(this.scope);
    const threadViews = await Promise.all(
      threads.map(async (thread) => {
        const [threadTasks, threadApprovals, latestRun] = await Promise.all([
          this.context.stores.taskStore.listByThread(thread.threadId),
          this.context.stores.approvalStore.listPendingByThread(thread.threadId),
          this.context.stores.runStore.getLatestByThread(thread.threadId),
        ]);
        const blockedTask = threadTasks.find((task) => task.status === "blocked" && task.blockingReason);

        return {
          ...thread,
          activeRunId: latestRun?.runId,
          activeRunStatus: latestRun?.status,
          pendingApprovalCount: threadApprovals.length,
          blockingReasonKind: blockedTask?.blockingReason?.kind,
        };
      }),
    );
    const runs = activeThread ? await this.context.stores.runStore.listByThread(activeThread.threadId) : [];
    const activeRun = activeThread ? await this.context.stores.runStore.getLatestByThread(activeThread.threadId) : undefined;
    const tasks = activeThread ? await this.context.stores.taskStore.listByThread(activeThread.threadId) : [];
    const pendingApprovals = activeThread ? await this.context.stores.approvalStore.listPendingByThread(activeThread.threadId) : [];
    const workers = activeThread ? await this.context.stores.workerStore.listByThread(activeThread.threadId) : [];
    const events = activeThread ? await this.context.stores.eventLog.listByThread(activeThread.threadId) : [];
    const narrative = activeThread ? await this.context.narrativeService.getNarrative(activeThread.threadId) : { summary: "", events: [], revision: 0, threadId: "" };

    return buildRuntimeSnapshot({
      scope: this.scope,
      activeThread,
      activeRunId: activeRun?.runId,
      threads: threadViews,
      runs,
      tasks,
      pendingApprovals,
      workers,
      events,
      fallbackLastEventSeq: this.liveSeq,
      narrativeSummary: narrative.summary || undefined,
    });
  }

  async handleCommand(command: RuntimeCommand): Promise<SessionCommandResult> {
    return await this.commandHandler(command);
  }

  async *subscribeEvents(afterSeq = 0): AsyncIterable<RuntimeEventEnvelope> {
    const activeThread = await this.getExistingActiveThread();
    await this.syncLiveSeqWithEventLog();
    const buffered = this.eventBuffer.filter((envelope) => envelope.seq > afterSeq);

    for (const envelope of buffered) {
      yield envelope;
    }

    if (buffered.length === 0 && activeThread) {
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
