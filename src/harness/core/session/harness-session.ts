import { createAppContext } from "../../../app/bootstrap";
import { createThread, transitionThread, type Thread } from "../../../domain/thread";
import type { SessionCommandResult } from "./session-kernel";
import { createRuntimeCommandHandler } from "./runtime-command-handler";
import { createRuntimeEventEnvelope, getStoredEventSequence, mapStoredEventToEnvelope } from "../../protocol/events/runtime-event-envelope";
import { buildRuntimeSnapshot } from "../../protocol/views/runtime-snapshot-builder";
import type { HarnessSessionScope } from "../../server/harness-session-scope";
import type { RuntimeCommand, RuntimeEventEnvelope, RuntimeSnapshot } from "../../protocol/schemas/api-schema";

type AppContext = Awaited<ReturnType<typeof createAppContext>>;

/**
 * scope 级 harness session。
 *
 * 它负责把 harness protocol 连接到 durable kernel / stores，
 * 并维护当前 scope 下的 active thread、snapshot projection
 * 与 live event stream。
 *
 * 注意：
 * - snapshot 是 projection，不是真相源
 * - thread / event log / stores 才是恢复与复盘的基础
 */
export class HarnessSession {
  private readonly eventBuffer: RuntimeEventEnvelope[] = [];
  private readonly maxBufferSize = 100;
  private readonly eventSubscribers = new Set<(envelope: RuntimeEventEnvelope) => void>();
  private liveSeq = 0;
  private activeThreadId?: string;
  private readonly commandHandler: (command: RuntimeCommand) => Promise<SessionCommandResult>;

  constructor(
    readonly scope: HarnessSessionScope,
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
      this.recordLiveEvent(event);
    });

    this.context.kernel.events.subscribeStream((event) => {
      this.recordLiveEvent({
        type: event.type,
        payload: event.payload,
      });
    });
  }

  private recordLiveEvent(event: { type: string; payload?: unknown }): RuntimeEventEnvelope {
    const envelope = createRuntimeEventEnvelope({
      seq: ++this.liveSeq,
      event,
    });

    this.eventBuffer.push(envelope);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }

    for (const subscriber of this.eventSubscribers) {
      subscriber(envelope);
    }

    return envelope;
  }

  private async ensureActiveThread(): Promise<Thread> {
    // 为当前 scope 维持一个 active thread 指针，并在第一条命令到来时按需创建。
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
    // 集中组装“当前到底什么是真的”这一份 projection，供各类 surface 客户端读取。
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
    const activeSuspension = activeRun
      ? await this.context.stores.runStateStore.loadActiveSuspensionByRun(activeRun.runId)
      : undefined;
    const planDecision = activeSuspension?.reasonKind === "waiting_plan_decision"
      ? activeSuspension.planDecision
      : undefined;
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
      planDecision,
    });
  }

  async handleCommand(command: RuntimeCommand): Promise<SessionCommandResult> {
    return await this.commandHandler(command);
  }

  async *subscribeEvents(afterSeq = 0): AsyncIterable<RuntimeEventEnvelope> {
    // 先回放 durable backlog，再继续消费内存中的实时队列。
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

    const handleEnvelope = (envelope: RuntimeEventEnvelope) => {
      queue.push(envelope);
      resolveNext?.();
      resolveNext = null;
    };
    this.eventSubscribers.add(handleEnvelope);

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
      this.eventSubscribers.delete(handleEnvelope);
    }
  }
}
