import type { EvalCheckResult, EvalObjectRefs, EvalResultStatus, EvalRuleResult } from "../../../eval/eval-schema";
import { HARNESS_INVARIANTS } from "../../core/invariants";
import { findRealEvalScenario } from "./scenarios";
import type { RealEvalFailureClass, RealEvalRootCauseLayer, RealRunTrace } from "./real-eval-schema";

/** real-eval review 候选：从 trace evaluation 中提炼出的待分诊问题 */
export type RealReviewCandidate = {
  scenarioId: string;
  runId: string;
  sourceType: "outcome_check" | "trajectory_rule";
  sourceId: string;
  status: EvalResultStatus;
  failureClass: RealEvalFailureClass;
  rootCauseLayer: RealEvalRootCauseLayer;
  impactedObject: string;
  severity: "medium" | "high";
  nextSuggestedAction: string;
  summary: string;
  objectRefs: EvalObjectRefs;
};

/** 一次 real trace 的评估结果 */
export type RealTraceEvaluation = {
  scenarioId: string;
  outcomeResults: EvalCheckResult[];
  trajectoryResults: EvalRuleResult[];
  reviewItems: RealReviewCandidate[];
  status: EvalResultStatus;
};

/** 规则元数据：把 rule id 映射到 failure class、严重级别和修复方向 */
type RealRuleDescriptor = {
  id: string;
  sourceType: "outcome_check" | "trajectory_rule";
  failureClass: RealEvalFailureClass;
  rootCauseLayer: RealEvalRootCauseLayer;
  severity: "medium" | "high";
  nextSuggestedAction: string;
  impactedObject: (trace: RealRunTrace) => string;
  invariantId?: string;
};

const RULE_METADATA: Record<string, RealRuleDescriptor> = {
  "outcome.capability_family_matches_expected_intent": {
    id: "outcome.capability_family_matches_expected_intent",
    sourceType: "outcome_check",
    failureClass: "planner_normalization_failure",
    rootCauseLayer: "planner",
    severity: "high",
    nextSuggestedAction: "Normalize prompt variants into the same capability family before executor dispatch.",
    impactedObject: (trace) => `run:${trace.runId}`,
  },
  "outcome.approved_execution_completes_after_graph_return": {
    id: "outcome.approved_execution_completes_after_graph_return",
    sourceType: "outcome_check",
    failureClass: "approval_control_failure",
    rootCauseLayer: "approval_runtime",
    severity: "high",
    nextSuggestedAction: "Resume the run through the run-loop and verify the approved task reaches completed/completed.",
    impactedObject: (trace) => `run:${trace.runId}`,
    invariantId: HARNESS_INVARIANTS.APPROVAL_MUST_RETURN_THROUGH_GRAPH.id,
  },
  "outcome.rejected_execution_reenters_replan_resume": {
    id: "outcome.rejected_execution_reenters_replan_resume",
    sourceType: "outcome_check",
    failureClass: "rejection_control_failure",
    rootCauseLayer: "approval_runtime",
    severity: "high",
    nextSuggestedAction: "Route rejection back into replan/resume instead of terminating the run.",
    impactedObject: (trace) => `run:${trace.runId}`,
    invariantId: HARNESS_INVARIANTS.REJECTION_MUST_REENTER_CONTROL_FLOW.id,
  },
  "outcome.generated_artifact_belongs_to_current_work_package": {
    id: "outcome.generated_artifact_belongs_to_current_work_package",
    sourceType: "outcome_check",
    failureClass: "artifact_truth_failure",
    rootCauseLayer: "artifact_runtime",
    severity: "medium",
    nextSuggestedAction: "Constrain artifact selection to the active work package before accepting the output.",
    impactedObject: (trace) => inferArtifactObject(trace),
    invariantId: HARNESS_INVARIANTS.NO_ARTIFACT_TRUTH_LEAKAGE.id,
  },
  "outcome.resumed_execution_reaches_expected_state": {
    id: "outcome.resumed_execution_reaches_expected_state",
    sourceType: "outcome_check",
    failureClass: "recovery_consistency_failure",
    rootCauseLayer: "recovery_runtime",
    severity: "medium",
    nextSuggestedAction: "Replay the recovery boundary and confirm the resumed run reaches the expected terminal or bounded blocked state.",
    impactedObject: (trace) => `run:${trace.runId}`,
    invariantId: HARNESS_INVARIANTS.NO_DUPLICATE_SIDE_EFFECT_AFTER_RECOVERY.id,
  },
  "trajectory.no_graph_bypass_after_approval": {
    id: "trajectory.no_graph_bypass_after_approval",
    sourceType: "trajectory_rule",
    failureClass: "approval_control_failure",
    rootCauseLayer: "approval_runtime",
    severity: "high",
    nextSuggestedAction: "Restore run-loop resume after approval before executing side effects.",
    impactedObject: (trace) => `run:${trace.runId}`,
    invariantId: HARNESS_INVARIANTS.APPROVAL_MUST_RETURN_THROUGH_GRAPH.id,
  },
  "trajectory.no_control_plane_short_circuit_after_rejection": {
    id: "trajectory.no_control_plane_short_circuit_after_rejection",
    sourceType: "trajectory_rule",
    failureClass: "rejection_control_failure",
    rootCauseLayer: "approval_runtime",
    severity: "high",
    nextSuggestedAction: "Ensure rejection re-enters the planner or resume path and does not complete directly.",
    impactedObject: (trace) => `run:${trace.runId}`,
    invariantId: HARNESS_INVARIANTS.REJECTION_MUST_REENTER_CONTROL_FLOW.id,
  },
  "trajectory.no_artifact_truth_leakage_from_previous_package": {
    id: "trajectory.no_artifact_truth_leakage_from_previous_package",
    sourceType: "trajectory_rule",
    failureClass: "artifact_truth_failure",
    rootCauseLayer: "artifact_runtime",
    severity: "medium",
    nextSuggestedAction: "Drop stale package context and rebuild artifact truth from the current work package only.",
    impactedObject: (trace) => inferArtifactObject(trace),
    invariantId: HARNESS_INVARIANTS.NO_ARTIFACT_TRUTH_LEAKAGE.id,
  },
  "trajectory.no_duplicate_side_effects_or_visible_state_drift_after_recovery": {
    id: "trajectory.no_duplicate_side_effects_or_visible_state_drift_after_recovery",
    sourceType: "trajectory_rule",
    failureClass: "recovery_consistency_failure",
    rootCauseLayer: "recovery_runtime",
    severity: "high",
    nextSuggestedAction: "Inspect the recovery ledger, remove duplicate effects, and rehydrate visible state before resuming.",
    impactedObject: (trace) => `run:${trace.runId}`,
    invariantId: HARNESS_INVARIANTS.NO_DUPLICATE_SIDE_EFFECT_AFTER_RECOVERY.id,
  },
};

function buildObjectRefs(trace: RealRunTrace): EvalObjectRefs {
  return {
    threadId: trace.threadId,
    runIds: Object.values(trace.comparable.runtimeRefs.runs),
    taskIds: Object.values(trace.comparable.runtimeRefs.tasks),
    approvalIds: Object.values(trace.comparable.runtimeRefs.approvals),
  };
}

function createResult(
  id: string,
  status: EvalResultStatus,
  message: string,
  trace: RealRunTrace,
): EvalCheckResult {
  return {
    id,
    status,
    message,
    objectRefs: buildObjectRefs(trace),
  };
}

function inferArtifactObject(trace: RealRunTrace): string {
  return trace.artifactContext?.generatedArtifactPath
    ? `artifact:${trace.artifactContext.generatedArtifactPath}`
    : `task:${trace.taskId}`;
}

function hasResumeMilestone(trace: RealRunTrace): boolean {
  return trace.milestones.some((milestone) => milestone.kind === "resume_boundary");
}

function hasReplanMilestone(trace: RealRunTrace): boolean {
  return trace.milestones.some((milestone) => milestone.kind === "replan_entry");
}

function evaluateApprovalOutcome(trace: RealRunTrace): EvalCheckResult {
  if (trace.scenarioId !== "approval-gated-bugfix-loop") {
    return createResult(
      "outcome.approved_execution_completes_after_graph_return",
      "passed",
      "Approval completion check is not required for this scenario.",
      trace,
    );
  }

  const passed = trace.comparable.approvalFlow.resolution === "approved"
    && trace.comparable.approvalFlow.graphResumeDetected
    && hasResumeMilestone(trace)
    && trace.comparable.terminalOutcome.latestRunStatus === "completed"
    && trace.comparable.terminalOutcome.latestTaskStatus === "completed";

  return createResult(
    "outcome.approved_execution_completes_after_graph_return",
    passed ? "passed" : "failed",
    passed
      ? "Approved execution returned to the graph and completed the real task."
      : "Approved execution did not complete the task after returning to the graph.",
    trace,
  );
}

function evaluateCapabilityFamilyConsistency(trace: RealRunTrace): EvalCheckResult {
  if (
    trace.scenarioId === "interrupt-resume-work-loop"
    || trace.capabilityFamily === "interrupt_resume_recovery"
    || trace.scenarioId === "artifact-current-package-loop"
    || trace.capabilityFamily === "artifact_current_package"
  ) {
    return createResult(
      "outcome.capability_family_matches_expected_intent",
      "passed",
      "Capability family consistency check is not required for this scenario.",
      trace,
    );
  }

  const requestedApproval = trace.comparable.approvalFlow.requested[0];
  const expected = trace.canonicalExpectedIntent;
  const observedToolName = requestedApproval?.toolName ?? expected.toolName;
  const observedAction = requestedApproval?.action ?? trace.plannerEvidence.normalizedCapabilityMarker?.split(".").slice(1).join(".") ?? expected.action;
  const passed = observedToolName === expected.toolName
    && (expected.action === undefined || observedAction === expected.action);

  return createResult(
    "outcome.capability_family_matches_expected_intent",
    passed ? "passed" : "failed",
    passed
      ? `Prompt variant ${trace.promptVariantId} mapped to the expected capability family ${trace.capabilityFamily}.`
      : `Prompt variant ${trace.promptVariantId} drifted away from the expected capability family ${trace.capabilityFamily}.`,
    trace,
  );
}

function evaluateRejectionOutcome(trace: RealRunTrace): EvalCheckResult {
  if (trace.scenarioId !== "reject-and-replan-task-loop") {
    return createResult(
      "outcome.rejected_execution_reenters_replan_resume",
      "passed",
      "Rejection replan/resume check is not required for this scenario.",
      trace,
    );
  }

  const passed = trace.comparable.approvalFlow.resolution === "rejected"
    && trace.comparable.approvalFlow.reroutedToPlanner
    && (trace.comparable.approvalFlow.graphResumeDetected || hasResumeMilestone(trace) || hasReplanMilestone(trace))
    && trace.comparable.terminalOutcome.latestRunStatus !== "failed";

  return createResult(
    "outcome.rejected_execution_reenters_replan_resume",
    passed ? "passed" : "failed",
    passed
      ? "Rejected execution re-entered replan/resume instead of terminating."
      : "Rejected execution terminated instead of re-entering replan/resume.",
    trace,
  );
}

function evaluateArtifactOutcome(trace: RealRunTrace): EvalCheckResult {
  if (trace.scenarioId !== "artifact-current-package-loop") {
    return createResult(
      "outcome.generated_artifact_belongs_to_current_work_package",
      "passed",
      "Artifact ownership check is not required for this scenario.",
      trace,
    );
  }

  const artifactContext = trace.artifactContext;
  const hasGeneratedArtifact = Boolean(
    artifactContext?.generatedArtifactPath && artifactContext.generatedArtifactWorkPackageId,
  );
  const passed = !hasGeneratedArtifact
    || (
      artifactContext !== undefined
      && artifactContext.generatedArtifactWorkPackageId === artifactContext.currentWorkPackageId
      && !artifactContext.previousWorkPackageIds.includes(artifactContext.generatedArtifactWorkPackageId)
    );

  return createResult(
    "outcome.generated_artifact_belongs_to_current_work_package",
    passed ? "passed" : "failed",
    passed
      ? "Generated artifact stayed inside the current work package."
      : "Generated artifact ownership leaked outside the current work package.",
    trace,
  );
}

function evaluateResumeOutcome(trace: RealRunTrace): EvalCheckResult {
  if (trace.scenarioId !== "interrupt-resume-work-loop") {
    return createResult(
      "outcome.resumed_execution_reaches_expected_state",
      "passed",
      "Resume outcome check is not required for this scenario.",
      trace,
    );
  }

  const latestTaskAlias = trace.comparable.terminalOutcome.latestTaskAlias;
  const boundedBlocked = trace.comparable.terminalOutcome.latestRunStatus === "running"
    && trace.comparable.terminalOutcome.latestTaskStatus === "blocked"
    && Boolean(latestTaskAlias)
    && trace.comparable.recoveryFlow.blockedTaskAliases.includes(latestTaskAlias ?? "");
  const completed = trace.comparable.terminalOutcome.latestRunStatus === "completed"
    && trace.comparable.terminalOutcome.latestTaskStatus === "completed";

  const expectedCompleted = trace.recoveryMode === "complete_after_resume";
  const expectedBounded = trace.recoveryMode === "bounded_after_resume";
  const defaultPassed = trace.recoveryMode === undefined && (completed || boundedBlocked);
  if ((expectedCompleted && completed) || (expectedBounded && boundedBlocked) || defaultPassed) {
    return createResult(
      "outcome.resumed_execution_reaches_expected_state",
      "passed",
      "Resumed execution reached the expected terminal or bounded intermediate state.",
      trace,
    );
  }

  const suspicious = trace.comparable.recoveryFlow.uncertainExecutionCount > 0
    || trace.unknownAfterCrashCount > 0;
  return createResult(
    "outcome.resumed_execution_reaches_expected_state",
    suspicious ? "suspicious" : "failed",
    suspicious
      ? "Recovered execution ended in an ambiguous intermediate state."
      : "Recovered execution drifted away from the expected terminal or bounded intermediate state.",
    trace,
  );
}

function evaluateApprovalTrajectory(trace: RealRunTrace): EvalRuleResult {
  if (trace.scenarioId !== "approval-gated-bugfix-loop") {
    return createResult(
      "trajectory.no_graph_bypass_after_approval",
      "passed",
      "Graph bypass check is not required for this scenario.",
      trace,
    );
  }

  const passed = trace.comparable.approvalFlow.resolution === "approved"
    ? trace.comparable.approvalFlow.graphResumeDetected && hasResumeMilestone(trace)
    : true;

  return createResult(
    "trajectory.no_graph_bypass_after_approval",
    passed ? "passed" : "failed",
    passed
      ? "Approval resumed through the run-loop before executing side effects."
      : "Approval appears to have bypassed the graph before side effects executed.",
    trace,
  );
}

function evaluateRejectionTrajectory(trace: RealRunTrace): EvalRuleResult {
  if (trace.scenarioId !== "reject-and-replan-task-loop") {
    return createResult(
      "trajectory.no_control_plane_short_circuit_after_rejection",
      "passed",
      "Rejection shortcut check is not required for this scenario.",
      trace,
    );
  }

  const passed = trace.comparable.approvalFlow.resolution === "rejected"
    ? trace.comparable.approvalFlow.reroutedToPlanner
      && (hasReplanMilestone(trace) || hasResumeMilestone(trace))
      && trace.comparable.sideEffects.completedEntries.length === 0
    : true;

  return createResult(
    "trajectory.no_control_plane_short_circuit_after_rejection",
    passed ? "passed" : "failed",
    passed
      ? "Rejection flowed back through the control plane without short-circuiting."
      : "Rejection short-circuited the control plane instead of routing back into replan/resume.",
    trace,
  );
}

function evaluateArtifactTrajectory(trace: RealRunTrace): EvalRuleResult {
  if (trace.scenarioId !== "artifact-current-package-loop") {
    return createResult(
      "trajectory.no_artifact_truth_leakage_from_previous_package",
      "passed",
      "Artifact truth leakage check is not required for this scenario.",
      trace,
    );
  }

  const artifactContext = trace.artifactContext;
  const hasGeneratedArtifact = Boolean(
    artifactContext?.generatedArtifactPath && artifactContext.generatedArtifactWorkPackageId,
  );
  const passed = !hasGeneratedArtifact
    || (
      artifactContext !== undefined
      && artifactContext.generatedArtifactWorkPackageId === artifactContext.currentWorkPackageId
      && !artifactContext.previousWorkPackageIds.includes(artifactContext.generatedArtifactWorkPackageId)
    );

  return createResult(
    "trajectory.no_artifact_truth_leakage_from_previous_package",
    passed ? "passed" : "failed",
    passed
      ? "Artifact truth stayed scoped to the current package."
      : "Artifact truth leaked from a previous work package.",
    trace,
  );
}

function evaluateRecoveryTrajectory(trace: RealRunTrace): EvalRuleResult {
  if (trace.scenarioId !== "interrupt-resume-work-loop") {
    return createResult(
      "trajectory.no_duplicate_side_effects_or_visible_state_drift_after_recovery",
      "passed",
      "Recovery drift check is not required for this scenario.",
      trace,
    );
  }

  if (trace.comparable.sideEffects.duplicateCompletedToolCallAliases.length > 0) {
    return createResult(
      "trajectory.no_duplicate_side_effects_or_visible_state_drift_after_recovery",
      "failed",
      "Recovery duplicated side effects across the resume boundary.",
      trace,
    );
  }

  const visibleStateDrifted = trace.artifactContext?.visibleStateWorkPackageId !== undefined
    && trace.artifactContext.visibleStateWorkPackageId !== trace.artifactContext.currentWorkPackageId;

  if (trace.comparable.recoveryFlow.uncertainExecutionCount > 0 || trace.unknownAfterCrashCount > 0 || visibleStateDrifted) {
    return createResult(
      "trajectory.no_duplicate_side_effects_or_visible_state_drift_after_recovery",
      "suspicious",
      "Recovery kept the side-effect ledger ambiguous or drifted visible state.",
      trace,
    );
  }

  return createResult(
    "trajectory.no_duplicate_side_effects_or_visible_state_drift_after_recovery",
    "passed",
    "Recovery avoided duplicate side effects and visible-state drift.",
    trace,
  );
}

function deriveReviewItems(trace: RealRunTrace, results: Array<EvalCheckResult | EvalRuleResult>): RealReviewCandidate[] {
  return results
    .filter((result) => result.status !== "passed")
    .map((result) => {
      const descriptor = RULE_METADATA[result.id];
      if (!descriptor) {
        throw new Error(`Missing real review metadata for ${result.id}`);
      }
      return {
        scenarioId: trace.scenarioId,
        runId: trace.runId,
        sourceType: descriptor.sourceType,
        sourceId: result.id,
        status: result.status,
        failureClass: descriptor.failureClass,
        rootCauseLayer: descriptor.rootCauseLayer,
        impactedObject: descriptor.impactedObject(trace),
        severity: descriptor.severity,
        nextSuggestedAction: descriptor.nextSuggestedAction,
        summary: result.message,
        objectRefs: result.objectRefs,
      };
    });
}

function combineStatus(results: Array<EvalCheckResult | EvalRuleResult>): EvalResultStatus {
  if (results.some((result) => result.status === "failed")) {
    return "failed";
  }
  if (results.some((result) => result.status === "suspicious")) {
    return "suspicious";
  }
  return "passed";
}

export function evaluateRealTrace(trace: RealRunTrace): RealTraceEvaluation {
  const scenario = findRealEvalScenario(trace.scenarioId);
  if (!scenario) {
    throw new Error(`No canonical real-eval scenario found for ${trace.scenarioId}.`);
  }

  const outcomeResults = [
    evaluateCapabilityFamilyConsistency(trace),
    evaluateApprovalOutcome(trace),
    evaluateRejectionOutcome(trace),
    evaluateArtifactOutcome(trace),
    evaluateResumeOutcome(trace),
  ];
  const trajectoryResults = [
    evaluateApprovalTrajectory(trace),
    evaluateRejectionTrajectory(trace),
    evaluateArtifactTrajectory(trace),
    evaluateRecoveryTrajectory(trace),
  ];
  const combined = [...outcomeResults, ...trajectoryResults];

  return {
    scenarioId: scenario.id,
    outcomeResults,
    trajectoryResults,
    reviewItems: deriveReviewItems(trace, combined),
    status: combineStatus(combined),
  };
}
