import type { ControlTask } from "../tasks/task-types";
import type { ThreadStorePort } from "../../persistence/ports/thread-store-port";
import type { DerivedThreadView } from "./thread-compaction-types";

/** 叙事事件：兼容旧 narrative 视图的任务级摘要条目 */
export type NarrativeEvent = {
  taskId: string;
  summary: string;
  status: ControlTask["status"];
  timestamp: number;
};

/** 协作线叙事：供兼容层读取的摘要视图 */
export type ThreadNarrative = {
  threadId: string;
  summary: string;
  events: NarrativeEvent[];
  revision: number;
};

/** 协作线叙事服务接口 */
export interface ThreadNarrativeService {
  processTaskUpdate(task: ControlTask): Promise<void>;
  getNarrative(threadId: string): Promise<ThreadNarrative>;
}

/** 叙事服务选项：允许限制历史长度并接入 threadStore 持久化 */
export type NarrativeServiceOptions = {
  maxEvents?: number;
  threadStore?: ThreadStorePort;
};

/** 创建协作线叙事服务：把 task 更新投影成 narrative 兼容视图和派生 thread view */
export function createThreadNarrativeService(options: NarrativeServiceOptions = {}): ThreadNarrativeService {
  const narratives = new Map<string, ThreadNarrative>();
  const derivedViews = new Map<string, DerivedThreadView>();
  const threadUpdateLocks = new Map<string, Promise<void>>();
  const maxEvents = options.maxEvents ?? 50;
  const threadStore = options.threadStore;

  /** 生成空的派生 thread view，用于缺省合并 */
  function createEmptyView(): DerivedThreadView {
    const now = new Date().toISOString();
    return {
      recoveryFacts: {
        threadId: "",
        revision: 0,
        schemaVersion: 1,
        status: "active",
        updatedAt: now,
        pendingApprovals: [],
        conversationHistory: [],
      },
      narrativeState: {
        revision: 0,
        threadSummary: "",
        taskSummaries: [],
        openLoops: [],
        notableEvents: [],
        updatedAt: now,
      },
      workingSetWindow: {
        revision: 0,
        messages: [],
        toolResults: [],
        verifierFeedback: [],
        retrievedMemories: [],
        updatedAt: now,
      },
    };
  }

  /** 从 thread 上持久化的摘要信息构造兼容 narrative */
  function createNarrativeFromView(
    threadId: string,
    revision: number,
    fallbackSummary: string,
  ): ThreadNarrative {
    return {
      threadId,
      summary: fallbackSummary,
      events: [],
      revision,
    };
  }

  /** 取出 narrativeState 中的任务摘要列表 */
  function getTaskSummaries(view: DerivedThreadView): string[] {
    return view.narrativeState?.taskSummaries ?? [];
  }

  /** 追加 thread summary 文本 */
  function appendSummary(base: string, next: string): string {
    return base ? `${base}; ${next}` : next;
  }

  /** 哪些 task 状态需要写入 narrativeState */
  function shouldProjectIntoNarrativeState(task: ControlTask): boolean {
    return task.status === "blocked" || task.status === "completed" || task.status === "failed";
  }

  /** 哪些 task 状态需要影响旧兼容 narrative */
  function shouldAffectCompatibilityNarrative(task: ControlTask): boolean {
    return task.status === "completed" || task.status === "failed";
  }

  /** 合并持久化视图与内存视图，优先采用更新、更完整的一侧 */
  function mergeViews(
    persistedView: DerivedThreadView | undefined,
    inMemoryView: DerivedThreadView | undefined,
  ): DerivedThreadView {
    const base = createEmptyView();
    const source = persistedView || inMemoryView;

    return {
      recoveryFacts: {
        ...base.recoveryFacts!,
        ...source?.recoveryFacts,
        pendingApprovals:
          persistedView?.recoveryFacts?.pendingApprovals
          ?? inMemoryView?.recoveryFacts?.pendingApprovals
          ?? [],
        conversationHistory:
          persistedView?.recoveryFacts?.conversationHistory
          ?? inMemoryView?.recoveryFacts?.conversationHistory
          ?? [],
        activeTask:
          persistedView?.recoveryFacts?.activeTask
          ?? inMemoryView?.recoveryFacts?.activeTask,
        lastStableTask:
          persistedView?.recoveryFacts?.lastStableTask
          ?? inMemoryView?.recoveryFacts?.lastStableTask,
        blocking:
          persistedView?.recoveryFacts?.blocking
          ?? inMemoryView?.recoveryFacts?.blocking,
        latestDurableAnswer:
          persistedView?.recoveryFacts?.latestDurableAnswer
          ?? inMemoryView?.recoveryFacts?.latestDurableAnswer,
        resumeAnchor:
          persistedView?.recoveryFacts?.resumeAnchor
          ?? inMemoryView?.recoveryFacts?.resumeAnchor,
      },
      narrativeState: {
        ...base.narrativeState!,
        ...source?.narrativeState,
        threadSummary:
          persistedView?.narrativeState?.threadSummary
          ?? inMemoryView?.narrativeState?.threadSummary
          ?? "",
        taskSummaries:
          persistedView?.narrativeState?.taskSummaries
          ?? inMemoryView?.narrativeState?.taskSummaries
          ?? [],
        openLoops:
          persistedView?.narrativeState?.openLoops
          ?? inMemoryView?.narrativeState?.openLoops
          ?? [],
        notableEvents:
          persistedView?.narrativeState?.notableEvents
          ?? inMemoryView?.narrativeState?.notableEvents
          ?? [],
      },
      workingSetWindow: {
        ...base.workingSetWindow!,
        ...source?.workingSetWindow,
        messages:
          persistedView?.workingSetWindow?.messages
          ?? inMemoryView?.workingSetWindow?.messages
          ?? [],
        toolResults:
          persistedView?.workingSetWindow?.toolResults
          ?? inMemoryView?.workingSetWindow?.toolResults
          ?? [],
        verifierFeedback:
          persistedView?.workingSetWindow?.verifierFeedback
          ?? inMemoryView?.workingSetWindow?.verifierFeedback
          ?? [],
        retrievedMemories:
          persistedView?.workingSetWindow?.retrievedMemories
          ?? inMemoryView?.workingSetWindow?.retrievedMemories
          ?? [],
      },
    };
  }

  /** 加载某条 thread 的叙事基线：组合持久化数据与内存缓存 */
  async function loadBaseView(threadId: string): Promise<{
    narrative: ThreadNarrative;
    view: DerivedThreadView;
    revision: number;
  }> {
    const inMemoryNarrative = narratives.get(threadId);
    const inMemoryView = derivedViews.get(threadId);
    const persistedThread = threadStore ? await threadStore.get(threadId) : undefined;
    const persistedView = persistedThread
      ? {
          recoveryFacts: persistedThread.recoveryFacts,
          narrativeState: persistedThread.narrativeState,
          workingSetWindow: persistedThread.workingSetWindow,
          narrativeSummary: persistedThread.narrativeSummary,
        }
      : undefined;

    const view = mergeViews(persistedView, inMemoryView);
    const persistedSummary = persistedThread?.narrativeSummary ?? "";
    const persistedRevision = persistedThread?.narrativeRevision ?? 0;
    const persistedNarrative = createNarrativeFromView(
      threadId,
      persistedRevision,
      persistedSummary,
    );
    const usePersistedNarrative =
      !inMemoryNarrative
      || persistedRevision > inMemoryNarrative.revision
      || (
        persistedRevision === inMemoryNarrative.revision
        && persistedSummary.length > 0
        && persistedSummary !== inMemoryNarrative.summary
      );
    const narrative = usePersistedNarrative ? persistedNarrative : inMemoryNarrative;
    const revision = Math.max(inMemoryNarrative?.revision ?? 0, persistedRevision);

    return {
      narrative,
      view,
      revision,
    };
  }

  return {
    async processTaskUpdate(task: ControlTask): Promise<void> {
      // 同一 thread 的更新必须串行化，避免并发写把 narrative/derived view 互相覆盖。
      const previousLock = threadUpdateLocks.get(task.threadId) ?? Promise.resolve();
      let releaseLock: () => void = () => {};
      const currentLock = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      const queuedLock = previousLock.then(() => currentLock);
      threadUpdateLocks.set(task.threadId, queuedLock);

      await previousLock;
      try {
        const {
          narrative,
          view,
          revision,
        } = await loadBaseView(task.threadId);
        const nextView: DerivedThreadView = {
          recoveryFacts: view.recoveryFacts ? {
            ...view.recoveryFacts,
            pendingApprovals: [...view.recoveryFacts.pendingApprovals],
            conversationHistory: [...(view.recoveryFacts.conversationHistory ?? [])],
            activeTask: view.recoveryFacts.activeTask ? { ...view.recoveryFacts.activeTask } : undefined,
            lastStableTask: view.recoveryFacts.lastStableTask ? { ...view.recoveryFacts.lastStableTask } : undefined,
            blocking: view.recoveryFacts.blocking ? { ...view.recoveryFacts.blocking } : undefined,
            latestDurableAnswer: view.recoveryFacts.latestDurableAnswer ? { ...view.recoveryFacts.latestDurableAnswer } : undefined,
            resumeAnchor: view.recoveryFacts.resumeAnchor ? { ...view.recoveryFacts.resumeAnchor } : undefined,
            environment: view.recoveryFacts.environment ? {
              ...view.recoveryFacts.environment,
              fingerprints: { ...view.recoveryFacts.environment.fingerprints },
            } : undefined,
            ledgerState: view.recoveryFacts.ledgerState ? { ...view.recoveryFacts.ledgerState } : undefined,
          } : undefined,
          narrativeState: view.narrativeState ? {
            ...view.narrativeState,
            taskSummaries: [...view.narrativeState.taskSummaries],
            openLoops: [...view.narrativeState.openLoops],
            notableEvents: [...view.narrativeState.notableEvents],
          } : undefined,
          workingSetWindow: view.workingSetWindow ? {
            ...view.workingSetWindow,
            messages: [...view.workingSetWindow.messages],
            toolResults: [...view.workingSetWindow.toolResults],
            verifierFeedback: [...view.workingSetWindow.verifierFeedback],
            retrievedMemories: [...view.workingSetWindow.retrievedMemories],
          } : undefined,
        };

        if (shouldProjectIntoNarrativeState(task)) {
          // blocked/completed/failed 会推进 narrativeState；
          // 但相邻重复摘要不会再次追加，避免 summary 连续刷屏。
          const taskSummaries = nextView.narrativeState?.taskSummaries ?? [];
          const lastSummary = taskSummaries.at(-1);
          if (task.summary !== lastSummary) {
            const narrativeState = nextView.narrativeState ?? createEmptyView().narrativeState!;
            narrativeState.taskSummaries = [...taskSummaries, task.summary];
            narrativeState.threadSummary = appendSummary(
              narrativeState.threadSummary,
              task.summary,
            );
            narrativeState.updatedAt = new Date().toISOString();
            narrativeState.revision = Math.max(narrativeState.revision, revision + 1);
            nextView.narrativeState = narrativeState;
          }
        }

        const previousTaskSummaries = getTaskSummaries(view);
        const nextTaskSummaries = getTaskSummaries(nextView);
        const narrativeChanged =
          shouldAffectCompatibilityNarrative(task)
          && (
            previousTaskSummaries.length !== nextTaskSummaries.length
            || previousTaskSummaries.some((summary, index) => summary !== nextTaskSummaries[index])
          );

        derivedViews.set(task.threadId, nextView);

        if (!narrativeChanged) {
          // 只有派生 narrativeState 变化、但兼容 narrative 未变化时，
          // 只回写 thread 上的 narrativeState，不追加兼容摘要事件。
          const narrativeStateChanged =
            previousTaskSummaries.length !== nextTaskSummaries.length
            || previousTaskSummaries.some((summary, index) => summary !== nextTaskSummaries[index])
            || (view.narrativeState?.threadSummary ?? "") !== (nextView.narrativeState?.threadSummary ?? "");

          if (threadStore && narrativeStateChanged) {
            const thread = await threadStore.get(task.threadId);
            if (thread) {
              await threadStore.save({
                ...thread,
                narrativeState: nextView.narrativeState,
              });
            }
          }
          return;
        }

        // 兼容 narrative 只保留稳定终态任务，避免 running/blocked 噪声污染旧读取面。
        const newEvent: NarrativeEvent = {
          taskId: task.taskId,
          summary: task.summary,
          status: task.status,
          timestamp: Date.now(),
        };

        const updatedEvents = [...narrative.events, newEvent];
        if (updatedEvents.length > maxEvents) {
          updatedEvents.splice(0, updatedEvents.length - maxEvents);
        }

        const nextSummary = appendSummary(narrative.summary, task.summary);

        const nextNarrative = {
          ...narrative,
          summary: nextSummary,
          events: updatedEvents,
          revision: revision + 1,
        };

        narratives.set(task.threadId, nextNarrative);

        if (threadStore) {
          const thread = await threadStore.get(task.threadId);
            if (thread) {
              // 如接入 threadStore，则把兼容摘要与派生 narrativeState 一并回写。
              await threadStore.save({
                ...thread,
                narrativeSummary: nextNarrative.summary,
                narrativeRevision: nextNarrative.revision,
                narrativeState: nextView.narrativeState,
              });
            }
          }
      } finally {
        releaseLock();
        if (threadUpdateLocks.get(task.threadId) === queuedLock) {
          threadUpdateLocks.delete(task.threadId);
        }
      }
    },

    async getNarrative(threadId: string): Promise<ThreadNarrative> {
      const { narrative } = await loadBaseView(threadId);
      return narrative;
    },
  };
}
