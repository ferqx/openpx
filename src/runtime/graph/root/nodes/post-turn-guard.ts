import { interrupt } from "@langchain/langgraph";
import type { RootMode } from "../context";
import type { RecoveryFacts } from "../../../../control/context/thread-compaction-types";

/** post-turn guard：在一轮结束前决定是 interrupt 等待人工，还是直接结束当前图执行 */
export function postTurnGuardNode(state: { mode: RootMode; recoveryFacts?: RecoveryFacts; status?: string }) {
  // waiting_approval 与 human_recovery 都不能直接自然结束，
  // 必须通过 interrupt 把控制权显式交还给外层 runtime / UI。
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

  // 其他情况直接把当前轮标记为 done，让 graph 返回结果。
  return {
    mode: "done" as const
  };
}
