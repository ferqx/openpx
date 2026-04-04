import type { DerivedThreadView, WorkingSetWindow } from "./thread-compaction-types";

export type CompactionRequest = {
  trigger: "soft" | "boundary" | "hard";
  tokenPressure?: number;
};

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

function shrinkWorkingSet(
  window: WorkingSetWindow | undefined,
  options: { keepRecent: number }
): WorkingSetWindow | undefined {
  if (!window) return undefined;
  return {
    ...window,
    messages: window.messages.slice(-options.keepRecent),
    toolResults: window.toolResults.slice(-options.keepRecent),
    verifierFeedback: window.verifierFeedback.slice(-options.keepRecent),
    retrievedMemories: window.retrievedMemories.slice(-options.keepRecent),
  };
}

export function compactThreadView(view: DerivedThreadView, input: CompactionRequest): DerivedThreadView {
  switch (input.trigger) {
    case "boundary": {
      const activeSummary = view.recoveryFacts?.activeTask?.summary ?? "";
      const summaries = view.narrativeState?.taskSummaries ?? [];
      const newSummaries = activeSummary ? dedupe([...summaries, activeSummary]) : summaries;
      const openLoops = view.narrativeState?.openLoops ?? [];
      const newOpenLoops = activeSummary ? dedupe([...openLoops, activeSummary]) : openLoops;

      return {
        ...view,
        narrativeState: {
          ...view.narrativeState,
          threadSummary: view.narrativeState?.threadSummary ?? "",
          notableEvents: view.narrativeState?.notableEvents ?? [],
          taskSummaries: newSummaries,
          openLoops: newOpenLoops,
        },
        workingSetWindow: shrinkWorkingSet(view.workingSetWindow, { keepRecent: 3 }),
      };
    }
    case "hard":
      return {
        ...view,
        workingSetWindow: shrinkWorkingSet(view.workingSetWindow, { keepRecent: 1 }),
      };
    default:
      return {
        ...view,
        workingSetWindow: shrinkWorkingSet(view.workingSetWindow, { keepRecent: 5 }),
      };
  }
}
