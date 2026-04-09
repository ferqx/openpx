import { prefixedUuid } from "../shared/id-generators";
import type { EvalCheckResult, EvalComparableRun, EvalObjectRefs, EvalRuleResult, EvalScenario, ReviewQueueItem } from "./eval-schema";

function buildObjectRefs(comparable: EvalComparableRun): EvalObjectRefs {
  return {
    threadId: comparable.runtimeRefs.threadId,
    runIds: Object.values(comparable.runtimeRefs.runs),
    taskIds: Object.values(comparable.runtimeRefs.tasks),
    approvalIds: Object.values(comparable.runtimeRefs.approvals),
  };
}

function createResult(
  id: string,
  passed: boolean,
  message: string,
  comparable: EvalComparableRun,
): EvalCheckResult {
  return {
    id,
    status: passed ? "passed" : "failed",
    message,
    objectRefs: buildObjectRefs(comparable),
  };
}

export function evaluateOutcome(scenario: EvalScenario, comparable: EvalComparableRun): EvalCheckResult[] {
  const results: EvalCheckResult[] = [];
  const summary = comparable.terminalOutcome.summary ?? "";

  if (scenario.expectedOutcome.terminalRunStatus) {
    results.push(
      createResult(
        "outcome.terminal_run_status",
        comparable.terminalOutcome.latestRunStatus === scenario.expectedOutcome.terminalRunStatus,
        `Expected terminal run status ${scenario.expectedOutcome.terminalRunStatus}, got ${comparable.terminalOutcome.latestRunStatus ?? "none"}.`,
        comparable,
      ),
    );
  }

  if (scenario.expectedOutcome.terminalTaskStatus) {
    results.push(
      createResult(
        "outcome.terminal_task_status",
        comparable.terminalOutcome.latestTaskStatus === scenario.expectedOutcome.terminalTaskStatus,
        `Expected terminal task status ${scenario.expectedOutcome.terminalTaskStatus}, got ${comparable.terminalOutcome.latestTaskStatus ?? "none"}.`,
        comparable,
      ),
    );
  }

  results.push(
    createResult(
      "outcome.summary_contains",
      scenario.expectedOutcome.expectedSummaryIncludes.every((token) => summary.includes(token)),
      `Expected summary to include ${scenario.expectedOutcome.expectedSummaryIncludes.join(", ") || "<none>"}.`,
      comparable,
    ),
  );
  results.push(
    createResult(
      "outcome.approval_count",
      comparable.approvalFlow.requested.length === scenario.expectedOutcome.expectedApprovalCount,
      `Expected ${scenario.expectedOutcome.expectedApprovalCount} approvals, got ${comparable.approvalFlow.requested.length}.`,
      comparable,
    ),
  );
  results.push(
    createResult(
      "outcome.pending_approval_count",
      comparable.terminalOutcome.pendingApprovalCount === scenario.expectedOutcome.expectedPendingApprovalCount,
      `Expected ${scenario.expectedOutcome.expectedPendingApprovalCount} pending approvals, got ${comparable.terminalOutcome.pendingApprovalCount}.`,
      comparable,
    ),
  );
  results.push(
    createResult(
      "outcome.tool_call_count",
      comparable.sideEffects.completedEntries.length === scenario.expectedOutcome.expectedToolCallCount,
      `Expected ${scenario.expectedOutcome.expectedToolCallCount} completed tool calls, got ${comparable.sideEffects.completedEntries.length}.`,
      comparable,
    ),
  );

  return results;
}

export function evaluateTrajectory(scenario: EvalScenario, comparable: EvalComparableRun): EvalRuleResult[] {
  const results: EvalRuleResult[] = [];
  const latestRun = comparable.terminalOutcome.latestRunAlias
    ? comparable.runLineage.find((run) => run.alias === comparable.terminalOutcome.latestRunAlias)
    : undefined;
  const latestTask = comparable.terminalOutcome.latestTaskAlias
    ? comparable.taskLineage.find((task) => task.alias === comparable.terminalOutcome.latestTaskAlias)
    : undefined;

  results.push(
    createResult(
      "trajectory.approval_presence",
      scenario.expectedControlSemantics.requiresApproval
        ? comparable.approvalFlow.requested.length > 0
        : comparable.approvalFlow.requested.length === 0,
      scenario.expectedControlSemantics.requiresApproval
        ? "Expected approval request to exist."
        : "Expected no approval request.",
      comparable,
    ),
  );

  results.push(
    createResult(
      "trajectory.approval_resolution",
      comparable.approvalFlow.resolution === scenario.expectedControlSemantics.expectedDecision,
      `Expected approval decision ${scenario.expectedControlSemantics.expectedDecision}, got ${comparable.approvalFlow.resolution}.`,
      comparable,
    ),
  );

  results.push(
    createResult(
      "trajectory.graph_resume",
      scenario.expectedControlSemantics.expectedGraphResume
        ? comparable.approvalFlow.graphResumeDetected
        : true,
      "Expected graph-backed approval/rejection resume signals.",
      comparable,
    ),
  );

  results.push(
    createResult(
      "trajectory.rejection_replan",
      scenario.expectedControlSemantics.expectedDecision === "rejected"
        ? comparable.approvalFlow.reroutedToPlanner
        : true,
      "Expected rejected approval to reroute back into planning.",
      comparable,
    ),
  );

  results.push(
    createResult(
      "trajectory.recovery_contract",
      scenario.expectedControlSemantics.expectedRecoveryMode === "human_recovery"
        ? comparable.recoveryFlow.humanRecoveryTriggered
        : !comparable.recoveryFlow.humanRecoveryTriggered,
      `Expected recovery mode ${scenario.expectedControlSemantics.expectedRecoveryMode}.`,
      comparable,
    ),
  );

  results.push(
    createResult(
      "trajectory.duplicate_side_effect",
      comparable.sideEffects.duplicateCompletedToolCallAliases.length === 0,
      "Expected no duplicate completed side effects.",
      comparable,
    ),
  );

  results.push(
    createResult(
      "trajectory.rejection_shortcut",
      comparable.approvalFlow.resolution === "rejected"
        ? comparable.sideEffects.completedEntries.length === 0
        : true,
      "Expected rejected approval to avoid executor side effects.",
      comparable,
    ),
  );

  results.push(
    createResult(
      "trajectory.resume_lineage_stability",
      comparable.recoveryFlow.resumedRunAliases.length > 0
        ? comparable.recoveryFlow.resumedRunAliases.every((runAlias) => comparable.taskLineage.some((task) => task.runAlias === runAlias))
          && (!latestRun || !latestTask || latestTask.runAlias === latestRun.alias)
        : true,
      "Expected resumed runs to keep stable run-task lineage.",
      comparable,
    ),
  );

  results.push(
    createResult(
      "trajectory.repeated_blocked_recovery",
      comparable.recoveryFlow.humanRecoveryTriggered && comparable.recoveryFlow.resumedRunAliases.length > 1
        ? comparable.recoveryFlow.blockedTaskAliases.length > 0 && comparable.terminalOutcome.latestTaskStatus === "blocked"
        : true,
      "Expected repeated recovery resumes to remain explicitly blocked.",
      comparable,
    ),
  );

  return results;
}

export function enqueueReviewItems(input: {
  scenarioId: string;
  scenarioRunId: string;
  outcomeResults: EvalCheckResult[];
  trajectoryResults: EvalRuleResult[];
  comparable: EvalComparableRun;
}): ReviewQueueItem[] {
  const failedOutcomeItems = input.outcomeResults
    .filter((result) => result.status !== "passed")
    .map<ReviewQueueItem>((result) => ({
      reviewItemId: prefixedUuid("review"),
      scenarioRunId: input.scenarioRunId,
      scenarioId: input.scenarioId,
      sourceType: "outcome_check",
      sourceId: result.id,
      severity: "high",
      triageStatus: "open",
      resolutionType: undefined,
      summary: result.message,
      objectRefs: buildObjectRefs(input.comparable),
      ownerNote: undefined,
      createdAt: new Date().toISOString(),
      closedAt: undefined,
    }));

  const trajectoryItems = input.trajectoryResults
    .filter((result) => result.status !== "passed")
    .map<ReviewQueueItem>((result) => ({
      reviewItemId: prefixedUuid("review"),
      scenarioRunId: input.scenarioRunId,
      scenarioId: input.scenarioId,
      sourceType: "trajectory_rule",
      sourceId: result.id,
      severity: result.id === "trajectory.duplicate_side_effect" ? "high" : "medium",
      triageStatus: "open",
      resolutionType: undefined,
      summary: result.message,
      objectRefs: buildObjectRefs(input.comparable),
      ownerNote: undefined,
      createdAt: new Date().toISOString(),
      closedAt: undefined,
    }));

  return [...failedOutcomeItems, ...trajectoryItems];
}
