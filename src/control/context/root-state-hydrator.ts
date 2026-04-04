import type { DerivedThreadView } from "./thread-compaction-types";

export function hydrateRootState(view: DerivedThreadView) {
  return {
    recoveryFacts: view.recoveryFacts,
    narrativeState: view.narrativeState,
    workingSetWindow: view.workingSetWindow,
  };
}
