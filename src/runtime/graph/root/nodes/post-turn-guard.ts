import { interrupt } from "@langchain/langgraph";
import type { RootMode } from "../context";
import type { RecoveryFacts } from "../../../../control/context/thread-compaction-types";

export function postTurnGuardNode(state: { mode: RootMode; recoveryFacts?: RecoveryFacts; status?: string }) {
  // If we are explicitly in a waiting_approval or human_recovery state, we MUST interrupt.
  if (state.mode === "waiting_approval" || state.recoveryFacts?.blocking?.kind === "human_recovery") {
    const resumeValue = interrupt({
      kind: "post-turn-review",
      mode: state.mode,
      summary: state.recoveryFacts?.activeTask?.summary ?? "",
    });

    return {
      resumeValue,
    };
  }

  // For all other cases, we mark the current turn as done so the graph can exit and return results.
  return {
    mode: "done" as const
  };
}
