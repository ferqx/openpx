import type { ControlTask } from "../tasks/task-types";

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
};

export function createThreadNarrativeService(options: NarrativeServiceOptions = {}): ThreadNarrativeService {
  const narratives = new Map<string, ThreadNarrative>();
  const maxEvents = options.maxEvents ?? 50;

  return {
    async processTaskUpdate(task: ControlTask): Promise<void> {
      // Promotes only stable task outputs into thread narrative state
      if (task.status !== "completed" && task.status !== "failed") {
        return;
      }

      let narrative = narratives.get(task.threadId);
      if (!narrative) {
        narrative = {
          threadId: task.threadId,
          summary: "",
          events: [],
          revision: 0,
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

      narratives.set(task.threadId, {
        ...narrative,
        summary: updatedSummary,
        events: updatedEvents,
        revision: narrative.revision + 1,
      });
    },

    async getNarrative(threadId: string): Promise<ThreadNarrative> {
      const narrative = narratives.get(threadId);
      if (!narrative) {
        return {
          threadId,
          summary: "",
          events: [],
          revision: 0,
        };
      }
      return narrative;
    },
  };
}
