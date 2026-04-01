import { interrupt } from "@langchain/langgraph";

export function postTurnGuardNode(state: { mode: "execute"; summary: string }) {
  interrupt({
    kind: "post-turn-review",
    mode: state.mode,
    summary: state.summary,
  });

  return {
    mode: "done" as const,
    summary: state.summary,
  };
}
