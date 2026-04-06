import type { DerivedThreadView, WorkingSetWindow, RecoveryFacts, NarrativeState } from "./thread-compaction-types";

export type CompactionRequest = {
  trigger: "soft" | "boundary" | "hard";
  tokenPressure?: number;
};

const CURRENT_SCHEMA_VERSION = 1;

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

function shrinkWorkingSet(
  window: WorkingSetWindow | undefined,
  options: { keepRecent: number }
): WorkingSetWindow | undefined {
  if (!window) return undefined;
  
  const now = new Date().toISOString();
  return {
    ...window,
    revision: window.revision + 1,
    messages: window.messages.slice(-options.keepRecent),
    toolResults: window.toolResults.slice(-options.keepRecent),
    verifierFeedback: window.verifierFeedback.slice(-options.keepRecent),
    retrievedMemories: window.retrievedMemories.slice(-options.keepRecent),
    updatedAt: now,
  };
}

function cloneRecoveryFacts(input?: RecoveryFacts): RecoveryFacts {
  if (!input) {
    throw new Error("Cannot compact empty recovery facts");
  }
  return {
    ...input,
    pendingApprovals: (input.pendingApprovals ?? []).map(a => ({ ...a })),
    environment: input.environment ? { 
      ...input.environment,
      fingerprints: { ...(input.environment.fingerprints ?? {}) }
    } : undefined,
  };
}

function cloneNarrativeState(input?: NarrativeState): NarrativeState {
  if (!input) {
    return {
      revision: 0,
      threadSummary: "",
      taskSummaries: [],
      openLoops: [],
      notableEvents: [],
      updatedAt: new Date().toISOString()
    };
  }
  return {
    ...input,
    taskSummaries: [...(input.taskSummaries ?? [])],
    openLoops: [...(input.openLoops ?? [])],
    notableEvents: [...(input.notableEvents ?? [])],
  };
}

export function compactThreadView(view: DerivedThreadView, input: CompactionRequest): DerivedThreadView {
  const now = new Date().toISOString();
  const nextView: DerivedThreadView = {
    recoveryFacts: cloneRecoveryFacts(view.recoveryFacts),
    narrativeState: cloneNarrativeState(view.narrativeState),
    workingSetWindow: view.workingSetWindow ? { ...view.workingSetWindow } : undefined,
  };

  let factChanged = false;
  let narrativeChanged = false;

  switch (input.trigger) {
    case "boundary": {
      const activeSummary = nextView.recoveryFacts?.activeTask?.summary;
      const openLoops = nextView.narrativeState!.openLoops;

      if (activeSummary && !openLoops.includes(activeSummary)) {
        narrativeChanged = true;
        nextView.narrativeState!.openLoops = dedupe([...openLoops, activeSummary]);
      }

      nextView.workingSetWindow = shrinkWorkingSet(view.workingSetWindow, { keepRecent: 10 });
      break;
    }
    case "hard": {
      nextView.workingSetWindow = shrinkWorkingSet(view.workingSetWindow, { keepRecent: 2 });
      break;
    }
    case "soft":
    default: {
      const keepRecent = (input.tokenPressure ?? 0) >= 0.4 ? 5 : 20;
      nextView.workingSetWindow = shrinkWorkingSet(view.workingSetWindow, { keepRecent });
      break;
    }
  }

  if (factChanged) {
    nextView.recoveryFacts!.revision += 1;
    nextView.recoveryFacts!.updatedAt = now;
    nextView.recoveryFacts!.schemaVersion = CURRENT_SCHEMA_VERSION;
  }
  if (narrativeChanged) {
    nextView.narrativeState!.revision += 1;
    nextView.narrativeState!.updatedAt = now;
  }

  return nextView;
}
