import type { ControlTask } from "../tasks/task-types";
import type { ThreadStorePort } from "../../persistence/ports/thread-store-port";
import { createThreadStateProjector } from "./thread-state-projector";
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
  const projector = createThreadStateProjector();
  const maxEvents = options.maxEvents ?? 50;
  const threadStore = options.threadStore;

  function createEmptyView(): DerivedThreadView {
    return {
      recoveryFacts: {
        pendingApprovals: [],
      },
      narrativeState: {
        threadSummary: "",
        taskSummaries: [],
        openLoops: [],
        notableEvents: [],
      },
      workingSetWindow: {
        messages: [],
        toolResults: [],
        verifierFeedback: [],
        retrievedMemories: [],
      },
    };
  }

  function createNarrativeFromView(
    threadId: string,
    view: DerivedThreadView,
    revision: number,
    fallbackSummary: string,
  ): ThreadNarrative {
    const hasNarrativeState =
      (view.narrativeState?.taskSummaries.length ?? 0) > 0
      || (view.narrativeState?.threadSummary.length ?? 0) > 0;

    return {
      threadId,
      summary: hasNarrativeState
        ? (view.narrativeState?.threadSummary ?? "")
        : fallbackSummary,
      events: [],
      revision,
    };
  }

  function getTaskSummaries(view: DerivedThreadView): string[] {
    return view.narrativeState?.taskSummaries ?? [];
  }

  function hasMeaningfulNarrativeState(view: DerivedThreadView | undefined): boolean {
    return Boolean(
      view?.narrativeState
      && (
        (view.narrativeState.threadSummary.length ?? 0) > 0
        || view.narrativeState.taskSummaries.length > 0
        || view.narrativeState.notableEvents.length > 0
        || view.narrativeState.openLoops.length > 0
      ),
    );
  }

  function appendSummary(base: string, next: string): string {
    return base ? `${base}; ${next}` : next;
  }

  function cloneView(view: DerivedThreadView): DerivedThreadView {
    return {
      recoveryFacts: view.recoveryFacts
        ? {
            ...view.recoveryFacts,
            activeTask: view.recoveryFacts.activeTask ? { ...view.recoveryFacts.activeTask } : undefined,
            lastStableTask: view.recoveryFacts.lastStableTask ? { ...view.recoveryFacts.lastStableTask } : undefined,
            blocking: view.recoveryFacts.blocking ? { ...view.recoveryFacts.blocking } : undefined,
            pendingApprovals: [...view.recoveryFacts.pendingApprovals],
            latestDurableAnswer: view.recoveryFacts.latestDurableAnswer
              ? { ...view.recoveryFacts.latestDurableAnswer }
              : undefined,
            resumeAnchor: view.recoveryFacts.resumeAnchor ? { ...view.recoveryFacts.resumeAnchor } : undefined,
          }
        : undefined,
      narrativeState: view.narrativeState
        ? {
            threadSummary: view.narrativeState.threadSummary,
            taskSummaries: [...view.narrativeState.taskSummaries],
            openLoops: [...view.narrativeState.openLoops],
            notableEvents: [...view.narrativeState.notableEvents],
          }
        : undefined,
      workingSetWindow: view.workingSetWindow
        ? {
            messages: [...view.workingSetWindow.messages],
            toolResults: [...view.workingSetWindow.toolResults],
            verifierFeedback: [...view.workingSetWindow.verifierFeedback],
            retrievedMemories: [...view.workingSetWindow.retrievedMemories],
          }
        : undefined,
    };
  }

  function mergeViews(
    persistedView: DerivedThreadView | undefined,
    inMemoryView: DerivedThreadView | undefined,
  ): DerivedThreadView {
    if (!persistedView && !inMemoryView) {
      return createEmptyView();
    }

    return {
      recoveryFacts: {
        pendingApprovals:
          persistedView?.recoveryFacts?.pendingApprovals
          ?? inMemoryView?.recoveryFacts?.pendingApprovals
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
    persistedSummary: string;
    hasPersistedNarrativeState: boolean;
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
      view,
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
      persistedSummary,
      hasPersistedNarrativeState: hasMeaningfulNarrativeState(persistedView),
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
          persistedSummary,
          hasPersistedNarrativeState,
        } = await loadBaseView(task.threadId);
        const nextView = projector.project(view, {
          kind: "task",
          task,
        });

        if (task.status === "blocked") {
          nextView.narrativeState = cloneView(view).narrativeState;
        }

        const previousTaskSummaries = getTaskSummaries(view);
        const nextTaskSummaries = getTaskSummaries(nextView);
        const narrativeChanged =
          previousTaskSummaries.length !== nextTaskSummaries.length
          || previousTaskSummaries.some((summary, index) => summary !== nextTaskSummaries[index]);

        derivedViews.set(task.threadId, nextView);

        if (!narrativeChanged) {
          if (threadStore) {
            const thread = await threadStore.get(task.threadId);
            if (thread) {
              await threadStore.save({
                ...thread,
                recoveryFacts: nextView.recoveryFacts,
                narrativeState: nextView.narrativeState,
                workingSetWindow: nextView.workingSetWindow,
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

        const nextSummary =
          !hasPersistedNarrativeState
          && persistedSummary.length > 0
          && (view.narrativeState?.taskSummaries.length ?? 0) === 0
            ? appendSummary(persistedSummary, task.summary)
            : (nextView.narrativeState?.threadSummary ?? "");
        if (
          nextSummary !== nextView.narrativeState?.threadSummary
          && nextView.narrativeState
        ) {
          nextView.narrativeState.threadSummary = nextSummary;
        }

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
              recoveryFacts: nextView.recoveryFacts,
              narrativeState: nextView.narrativeState,
              workingSetWindow: nextView.workingSetWindow,
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
