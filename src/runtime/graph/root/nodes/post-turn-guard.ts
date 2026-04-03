import { interrupt } from "@langchain/langgraph";
import type { RootMode } from "../context";

export function postTurnGuardNode(state: { mode: RootMode; summary: string }) {
  const resumeValue = interrupt({
    kind: "post-turn-review",
    mode: state.mode,
    summary: state.summary,
  });

  return {
    resumeValue,
  };
}
