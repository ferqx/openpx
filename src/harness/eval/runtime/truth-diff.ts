import type { RuntimeCollectedEvidence } from "./collector";

export type RuntimeTruthDifference = {
  field: string;
  expected: string;
  actual: string;
  message: string;
};

export type RuntimeTruthDiff = {
  differences: RuntimeTruthDifference[];
};

/** 对比 durable truth 与 projection/snapshot 的关键字段。 */
export function diffRuntimeTruth(input: RuntimeCollectedEvidence): RuntimeTruthDiff {
  const differences: RuntimeTruthDifference[] = [];
  const latestRun = input.latestRun;
  const snapshot = input.snapshot;
  const projection = input.sessionProjection;

  if (snapshot && input.thread && snapshot.activeThreadId !== input.thread.threadId) {
    differences.push({
      field: "snapshot.activeThreadId",
      expected: input.thread.threadId,
      actual: String(snapshot.activeThreadId),
      message: "snapshot activeThreadId does not match durable active thread.",
    });
  }
  if (snapshot && latestRun && snapshot.activeRunId !== latestRun.runId) {
    differences.push({
      field: "snapshot.activeRunId",
      expected: latestRun.runId,
      actual: String(snapshot.activeRunId),
      message: "snapshot activeRunId does not match latest durable run.",
    });
  }
  if (snapshot && snapshot.pendingApprovals.length !== input.pendingApprovals.length) {
    differences.push({
      field: "snapshot.pendingApprovals",
      expected: String(input.pendingApprovals.length),
      actual: String(snapshot.pendingApprovals.length),
      message: "snapshot pending approval count diverges from durable approval store.",
    });
  }
  if (projection && latestRun) {
    const expectedProjectionStatus =
      latestRun.status === "waiting_approval"
        ? "waiting_approval"
        : latestRun.status === "blocked" || latestRun.status === "failed" || latestRun.status === "interrupted"
          ? "blocked"
          : latestRun.status === "completed"
            ? "completed"
            : "active";
    if (projection.status !== expectedProjectionStatus) {
      differences.push({
        field: "sessionProjection.status",
        expected: expectedProjectionStatus,
        actual: projection.status,
        message: "session projection status diverges from latest durable run lifecycle.",
      });
    }
  }
  if (
    projection
    && input.thread?.recoveryFacts?.latestDurableAnswer?.summary
    && projection.finalResponse !== input.thread.recoveryFacts.latestDurableAnswer.summary
  ) {
    differences.push({
      field: "sessionProjection.finalResponse",
      expected: input.thread.recoveryFacts.latestDurableAnswer.summary,
      actual: String(projection.finalResponse),
      message: "session projection finalResponse does not match latest durable answer.",
    });
  }

  return { differences };
}
