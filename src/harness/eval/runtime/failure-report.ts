import type { RuntimeReplay } from "./replay";
import type { RuntimeTruthAnalysis } from "./truth-model";

export type RuntimeFailureReport = {
  metadata: RuntimeReplay["metadata"];
  failureStep?: string;
  latestStableStatus?: string;
  externalSideEffectRisk: "none" | "possible";
  enteredHumanRecovery: boolean;
  involvesApproval: boolean;
  recommendation: string;
  issues: RuntimeTruthAnalysis["issues"];
};

/** 基于 replay/analysis 生成最小可操作故障摘要。 */
export function buildRuntimeFailureReport(input: {
  replay: RuntimeReplay;
  analysis: RuntimeTruthAnalysis;
}): RuntimeFailureReport {
  const terminalType = [...input.replay.timeline].reverse().find((entry) => entry.type.startsWith("loop.") || entry.type.startsWith("task.") || entry.type.startsWith("thread."));
  const externalSideEffectRisk = input.replay.ledgerEntries.some((entry) => entry.status === "unknown_after_crash")
    ? "possible"
    : "none";
  const enteredHumanRecovery = input.replay.issues.some((issue) =>
    issue.code === "unknown_after_crash_without_human_recovery"
      ? false
      : input.replay.terminal.recommendationReason !== undefined,
  ) || input.replay.terminal.recommendationReason !== undefined;

  return {
    metadata: input.replay.metadata,
    failureStep: terminalType?.type,
    latestStableStatus: input.replay.terminal.runStatus,
    externalSideEffectRisk,
    enteredHumanRecovery,
    involvesApproval: input.replay.approvals.length > 0 || input.replay.suspensions.length > 0,
    recommendation:
      enteredHumanRecovery
        ? "inspect -> restart_run / resubmit_intent / abandon_run"
        : externalSideEffectRisk === "possible"
          ? "inspect ledger before retrying"
          : "inspect replay timeline and validation verdict",
    issues: input.analysis.issues,
  };
}

/** 渲染最小 Markdown 故障报告。 */
export function renderRuntimeFailureReportMarkdown(report: RuntimeFailureReport): string {
  const lines = [
    "# Runtime Failure Report",
    "",
    `- threadId: ${report.metadata.threadId ?? "n/a"}`,
    `- runId: ${report.metadata.runId ?? "n/a"}`,
    `- taskId: ${report.metadata.taskId ?? "n/a"}`,
    `- failureStep: ${report.failureStep ?? "n/a"}`,
    `- latestStableStatus: ${report.latestStableStatus ?? "n/a"}`,
    `- externalSideEffectRisk: ${report.externalSideEffectRisk}`,
    `- enteredHumanRecovery: ${report.enteredHumanRecovery}`,
    `- involvesApproval: ${report.involvesApproval}`,
    `- recommendation: ${report.recommendation}`,
    "",
    "## Issues",
  ];

  if (report.issues.length === 0) {
    lines.push("- none");
  } else {
    for (const issue of report.issues) {
      lines.push(`- [${issue.status}] ${issue.code}: ${issue.reason}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
