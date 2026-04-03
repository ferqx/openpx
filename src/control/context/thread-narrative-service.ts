import type { ControlTask } from "../tasks/task-types";
import type { ThreadStorePort } from "../../persistence/ports/thread-store-port";

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
  const maxEvents = options.maxEvents ?? 50;
  const threadStore = options.threadStore;

  function composeNarrativeSummary(prefix: string, events: NarrativeEvent[]): string {
    const recentSummary = events.map((event) => event.summary).join("; ");
    if (prefix && recentSummary) {
      return `${prefix}; ${recentSummary}`;
    }
    return prefix || recentSummary;
  }

  return {
    async processTaskUpdate(task: ControlTask): Promise<void> {
      // Promotes only stable task outputs into thread narrative state
      if (task.status !== "completed" && task.status !== "failed") {
        return;
      }

      let narrative = narratives.get(task.threadId);
      if (!narrative) {
        const persistedThread = threadStore ? await threadStore.get(task.threadId) : undefined;
        narrative = {
          threadId: task.threadId,
          summary: persistedThread?.narrativeSummary ?? "",
          events: [],
          revision: persistedThread?.narrativeRevision ?? 0,
        };
      }

      // Add to events
      const newEvent: NarrativeEvent = {
        taskId: task.taskId,
        summary: task.summary,
        status: task.status,
        timestamp: Date.now(),
      };

      const updatedEvents = [...narrative.events, newEvent];
      let updatedSummary = narrative.summary;

      // Handle compression
      if (updatedEvents.length > maxEvents) {
        const droppedEvents = updatedEvents.splice(0, updatedEvents.length - maxEvents);
        const dropSummary = droppedEvents.map(e => e.summary).join("; ");
        updatedSummary = updatedSummary 
          ? `${updatedSummary}; ${dropSummary}` 
          : dropSummary;
      }

      const composedSummary = composeNarrativeSummary(updatedSummary, updatedEvents);
      const nextNarrative = {
        ...narrative,
        summary: composedSummary,
        events: updatedEvents,
        revision: narrative.revision + 1,
      };

      narratives.set(task.threadId, nextNarrative);

      if (threadStore) {
        const thread = await threadStore.get(task.threadId);
        if (thread) {
          await threadStore.save({
            ...thread,
            narrativeSummary: nextNarrative.summary,
            narrativeRevision: nextNarrative.revision,
          });
        }
      }
    },

    async getNarrative(threadId: string): Promise<ThreadNarrative> {
      const inMemory = narratives.get(threadId);
      const persistedThread = threadStore ? await threadStore.get(threadId) : undefined;

      if (!inMemory && !persistedThread) {
        return {
          threadId,
          summary: "",
          events: [],
          revision: 0,
        };
      }

      return {
        threadId,
        summary: inMemory?.summary ?? persistedThread?.narrativeSummary ?? "",
        events: inMemory?.events ?? [],
        revision: inMemory?.revision ?? persistedThread?.narrativeRevision ?? 0,
      };
    },
  };
}
