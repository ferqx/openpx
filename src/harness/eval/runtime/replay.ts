import type { RuntimeCollectedEvidence } from "./collector";
import type { RuntimeTruthAnalysis } from "./truth-model";
import type { RuntimeTruthDiff } from "./truth-diff";

export type RuntimeReplay = {
  metadata: {
    workspaceRoot: string;
    projectId: string;
    threadId?: string;
    runId?: string;
    taskId?: string;
    dataDir: string;
  };
  terminal: {
    runStatus?: string;
    taskStatus?: string;
    finalResponse?: string;
    pauseSummary?: string;
    recommendationReason?: string;
  };
  approvals: RuntimeCollectedEvidence["approvals"];
  suspensions: RuntimeCollectedEvidence["suspensions"];
  continuations: RuntimeCollectedEvidence["continuations"];
  ledgerEntries: RuntimeCollectedEvidence["ledgerEntries"];
  timeline: Array<{
    type: string;
    createdAt?: string;
    summary?: string;
  }>;
  issues: RuntimeTruthAnalysis["issues"];
  truthDiff: RuntimeTruthDiff["differences"];
};

/** 构造结构化 replay 结果。 */
export function buildRuntimeReplay(input: {
  evidence: RuntimeCollectedEvidence;
  analysis: RuntimeTruthAnalysis;
  truthDiff: RuntimeTruthDiff;
}): RuntimeReplay {
  return {
    metadata: {
      workspaceRoot: input.evidence.workspaceRoot,
      projectId: input.evidence.projectId,
      threadId: input.evidence.thread?.threadId,
      runId: input.evidence.latestRun?.runId,
      taskId: input.evidence.latestTask?.taskId,
      dataDir: input.evidence.dataDir,
    },
    terminal: {
      runStatus: input.evidence.latestRun?.status,
      taskStatus: input.evidence.latestTask?.status,
      finalResponse: input.evidence.sessionProjection?.finalResponse ?? input.evidence.snapshot?.finalResponse,
      pauseSummary: input.evidence.sessionProjection?.pauseSummary ?? input.evidence.snapshot?.pauseSummary,
      recommendationReason: input.evidence.sessionProjection?.recommendationReason,
    },
    approvals: input.evidence.approvals,
    suspensions: input.evidence.suspensions,
    continuations: input.evidence.continuations,
    ledgerEntries: input.evidence.ledgerEntries,
    timeline: input.evidence.events.map((event) => ({
      type: event.type,
      createdAt: event.createdAt,
      summary:
        typeof event.payload?.summary === "string"
          ? event.payload.summary
          : undefined,
    })),
    issues: input.analysis.issues,
    truthDiff: input.truthDiff.differences,
  };
}

/** 把 replay 渲染为 Markdown，便于 issue / CI artifact 阅读。 */
export function renderRuntimeReplayMarkdown(replay: RuntimeReplay): string {
  const lines = [
    "# Runtime Replay",
    "",
    `- threadId: ${replay.metadata.threadId ?? "n/a"}`,
    `- runId: ${replay.metadata.runId ?? "n/a"}`,
    `- taskId: ${replay.metadata.taskId ?? "n/a"}`,
    `- runStatus: ${replay.terminal.runStatus ?? "n/a"}`,
    `- taskStatus: ${replay.terminal.taskStatus ?? "n/a"}`,
  ];

  if (replay.terminal.finalResponse) {
    lines.push(`- finalResponse: ${replay.terminal.finalResponse}`);
  }
  if (replay.terminal.pauseSummary) {
    lines.push(`- pauseSummary: ${replay.terminal.pauseSummary}`);
  }
  if (replay.terminal.recommendationReason) {
    lines.push(`- recommendationReason: ${replay.terminal.recommendationReason}`);
  }

  lines.push("", "## Timeline");
  for (const entry of replay.timeline) {
    lines.push(`- ${entry.type}${entry.summary ? ` :: ${entry.summary}` : ""}`);
  }

  lines.push("", "## Issues");
  if (replay.issues.length === 0) {
    lines.push("- none");
  } else {
    for (const issue of replay.issues) {
      lines.push(`- [${issue.status}] ${issue.code}: ${issue.reason}`);
    }
  }

  lines.push("", "## Truth Diff");
  if (replay.truthDiff.length === 0) {
    lines.push("- none");
  } else {
    for (const difference of replay.truthDiff) {
      lines.push(`- ${difference.field}: expected=${difference.expected} actual=${difference.actual}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
