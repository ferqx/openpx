import { interrupt } from "@langchain/langgraph";
import type { RootMode } from "../context";
import type { RecoveryFacts } from "../../../../control/context/thread-compaction-types";
import type { ArtifactRecord } from "../../../artifacts/artifact-index";
import type { WorkPackage } from "../../../planning/work-package";

/** post-turn guard：在一轮结束前决定是 interrupt 等待人工，还是直接结束当前图执行 */
export function postTurnGuardNode(state: {
  mode: RootMode;
  recoveryFacts?: RecoveryFacts;
  status?: string;
  executionSummary?: string;
  latestArtifacts?: ArtifactRecord[];
  workPackages?: WorkPackage[];
}) {
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

  const hasFreshArtifacts = (state.latestArtifacts?.length ?? 0) > 0;
  const hasPlannedWork = (state.workPackages?.length ?? 0) > 0;
  if (state.mode === "execute" && hasFreshArtifacts && hasPlannedWork) {
    // 当前轮已经拿到可验证的产物，回到 router 继续 verifier / responder 主链路。
    return {
      mode: "execute" as const,
    };
  }

  if (state.mode === "execute" && state.executionSummary?.trim()) {
    // 对没有 artifact 的执行结果，使用系统兜底把执行摘要升级成最终回答。
    return {
      finalResponse: state.executionSummary,
      finalResponseSource: "system_fallback" as const,
      mode: "done" as const,
    };
  }

  // 其他情况直接把当前轮标记为 done，让 graph 返回结果。
  return {
    mode: "done" as const
  };
}
