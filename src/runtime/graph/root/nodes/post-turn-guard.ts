import { interrupt } from "@langchain/langgraph";
import type { RootMode } from "../context";

export function postTurnGuardNode(state: { mode: RootMode; summary: string }) {
  if (state.mode === "done" || state.mode === "completed" as any) {
    return { mode: "done" as const };
  }

  const resumeValue = interrupt({
    kind: "post-turn-review",
    mode: state.mode,
    summary: state.summary,
  });

  return {
    resumeValue,
  };
}
