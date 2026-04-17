import type { RuntimeCollectedEvidence } from "./collector";
import type { RuntimeTruthDiff } from "./truth-diff";

export const runtimeTruthPrecedence = [
  "stores",
  "execution_ledger",
  "event_log",
  "snapshot_projection",
] as const;

export type RuntimeAnalyzerIssue = {
  code:
    | "waiting_approval_without_suspension"
    | "unknown_after_crash_without_human_recovery"
    | "active_state_not_cleaned"
    | "truth_projection_mismatch";
  status: "passed" | "failed" | "suspicious";
  reason: string;
};

export type RuntimeTruthAnalysis = {
  issues: RuntimeAnalyzerIssue[];
  loopEventCoverage: number;
};

/** 基于统一解释模型分析 runtime truth。 */
export function analyzeRuntimeTruth(input: {
  evidence: RuntimeCollectedEvidence;
  truthDiff: RuntimeTruthDiff;
}): RuntimeTruthAnalysis {
  const issues: RuntimeAnalyzerIssue[] = [];
  const latestRun = input.evidence.latestRun;
  const activeSuspensionCount = input.evidence.suspensions.filter((item) => item.status === "active").length;
  const unknownAfterCrashCount = input.evidence.ledgerEntries.filter((item) => item.status === "unknown_after_crash").length;
  const loopEvents = input.evidence.events.filter((event) => event.type.startsWith("loop."));
  const loopEventKinds = new Set(loopEvents.map((event) => event.type));
  const loopEventCoverage = loopEvents.length === 0 ? 0 : loopEventKinds.size / 6;

  if (latestRun?.status === "waiting_approval" && activeSuspensionCount === 0) {
    issues.push({
      code: "waiting_approval_without_suspension",
      status: "failed",
      reason: "Latest run is waiting_approval but no active suspension exists in durable run-state.",
    });
  }
  if (unknownAfterCrashCount > 0 && latestRun?.blockingReason?.kind !== "human_recovery") {
    issues.push({
      code: "unknown_after_crash_without_human_recovery",
      status: "failed",
      reason: "Execution ledger contains unknown_after_crash entries but run is not blocked in human_recovery.",
    });
  }
  if (latestRun?.status === "completed" && input.evidence.suspensions.some((item) => item.status === "active")) {
    issues.push({
      code: "active_state_not_cleaned",
      status: "suspicious",
      reason: "Completed run still has active suspension records.",
    });
  }
  if (input.truthDiff.differences.length > 0) {
    issues.push({
      code: "truth_projection_mismatch",
      status: "suspicious",
      reason: `Detected ${input.truthDiff.differences.length} truth/projection mismatches.`,
    });
  }

  return {
    issues,
    loopEventCoverage,
  };
}
