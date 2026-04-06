import type { ControlTask } from "../tasks/task-types";
import type { ThreadStorePort } from "../../persistence/ports/thread-store-port";
import type { DerivedThreadView } from "./thread-compaction-types";

export type NarrativeEvent = {
  taskId: string;
  summary: string;
  status: ControlTask["status"];
  timestamp: number;
};

export type ThreadNarrative = {
  threadId: string;
  summary: string;
  events: NarrativeEvent[];
  revision: number;
};

export interface ThreadNarrativeService {
  processTaskUpdate(task: ControlTask): Promise<void>;
  getNarrative(threadId: string): Promise<ThreadNarrative>;
}

export type NarrativeServiceOptions = {
  maxEvents?: number;
  threadStore?: ThreadStorePort;
};

export function createThreadNarrativeService(options: NarrativeServiceOptions = {}): ThreadNarrativeService {
  const narratives = new Map<string, ThreadNarrative>();
  const derivedViews = new Map<string, DerivedThreadView>();
  const threadUpdateLocks = new Map<string, Promise<void>>();
  const maxEvents = options.maxEvents ?? 50;
  const threadStore = options.threadStore;

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

  function getTaskSummaries(view: DerivedThreadView): string[] {
    return view.narrativeState?.taskSummaries ?? [];
  }

  function appendSummary(base: string, next: string): string {
    return base ? `${base}; ${next}` : next;
  }

  function shouldProjectIntoNarrativeState(task: ControlTask): boolean {
    return task.status === "blocked" || task.status === "completed" || task.status === "failed";
  }

  function shouldAffectCompatibilityNarrative(task: ControlTask): boolean {
    return task.status === "completed" || task.status === "failed";
  }

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
