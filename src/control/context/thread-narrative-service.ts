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
    return {
      threadId,
      summary: view.narrativeState?.threadSummary ?? fallbackSummary,
      events: (view.narrativeState?.taskSummaries ?? []).map((summary, index) => ({
        taskId: `narrative-${index + 1}`,
        summary,
        status: "completed",
        timestamp: 0,
      })),
      revision,
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

    const view = inMemoryView ?? persistedView ?? createEmptyView();
    const threadSummary = persistedThread?.narrativeSummary ?? "";
    const revision = inMemoryNarrative?.revision ?? persistedThread?.narrativeRevision ?? 0;
    const narrative =
      inMemoryNarrative
      ?? createNarrativeFromView(threadId, view, revision, threadSummary);

    return {
      narrative,
      view,
      revision,
    };
  }

  return {
    async processTaskUpdate(task: ControlTask): Promise<void> {
      const { narrative, view, revision } = await loadBaseView(task.threadId);
      const nextView = projector.project(view, {
        kind: "task",
        task,
      });
      const narrativeChanged =
        nextView.narrativeState?.taskSummaries.length !== view.narrativeState?.taskSummaries.length;

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

      const nextNarrative = {
        ...narrative,
        summary: nextView.narrativeState?.threadSummary ?? "",
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
    },

    async getNarrative(threadId: string): Promise<ThreadNarrative> {
      const { narrative } = await loadBaseView(threadId);
      return narrative;
    },
  };
}
