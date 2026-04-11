import { describe, expect, test } from "bun:test";
import { realRunTraceSchema, type RealRunTrace } from "../../src/real-eval/real-eval-schema";
import { evaluateRealTrace } from "../../src/real-eval/evaluation";

function createBaseTrace(overrides?: Partial<RealRunTrace>): RealRunTrace {
  const baseComparable = {
    runtimeRefs: {
      threadId: "thread_real_1",
      runs: {
        run_initial: "run_initial_id",
        run_active: "run_active_id",
      },
      tasks: {
        task_active: "task_active_id",
      },
      approvals: {
        approval_1: "approval_1_id",
      },
      toolCalls: {
        tool_call_1: "tool_call_1_id",
      },
    },
    terminalOutcome: {
      threadStatus: "active",
      latestRunAlias: "run_active",
      latestRunStatus: "completed",
      latestTaskAlias: "task_active",
      latestTaskStatus: "completed",
      pendingApprovalCount: 0,
      summary: "Deleted src/approval-target.ts in pkg_current after returning to graph",
    },
    runLineage: [
      {
        alias: "run_initial",
        trigger: "user_input",
        status: "waiting_approval",
        activeTaskAlias: "task_active",
        blockingKind: "waiting_approval",
        inputText: "repair approval target inside pkg_current",
      },
      {
        alias: "run_active",
        trigger: "system_resume",
        status: "completed",
        activeTaskAlias: "task_active",
        summary: "Deleted src/approval-target.ts in pkg_current after returning to graph",
      },
    ],
    taskLineage: [
      {
        alias: "task_active",
        runAlias: "run_active",
        status: "completed",
        summary: "Apply artifact change for pkg_current using src/approval-target.ts",
      },
    ],
    approvalFlow: {
      requested: [
        {
          alias: "approval_1",
          runAlias: "run_initial",
          taskAlias: "task_active",
          status: "approved",
          summary: "apply_patch delete_file src/approval-target.ts",
          toolName: "apply_patch",
          action: "delete_file",
        },
      ],
      resolution: "approved",
      graphResumeDetected: true,
      reroutedToPlanner: false,
    },
    recoveryFlow: {
      humanRecoveryTriggered: false,
      uncertainExecutionCount: 0,
      blockedTaskAliases: [],
      interruptedRunAliases: [],
      resumedRunAliases: ["run_active"],
    },
    sideEffects: {
      totalEntries: 1,
      unknownAfterCrashCount: 0,
      completedEntries: [
        {
          taskAlias: "task_active",
          runAlias: "run_active",
          toolCallAlias: "tool_call_1",
          toolName: "apply_patch",
          status: "completed",
        },
      ],
      duplicateCompletedToolCallAliases: [],
    },
    eventMilestones: {
      eventTypes: ["approval.requested", "approval.resolved", "tool.executed", "task.completed"],
      toolExecutedCount: 1,
      toolFailedCount: 0,
      threadBlockedCount: 0,
      taskCompletedCount: 1,
      taskFailedCount: 0,
      taskUpdatedBlockedCount: 0,
    },
  } satisfies RealRunTrace["comparable"];

  return realRunTraceSchema.parse({
    scenarioId: "approval-gated-bugfix-loop",
    promptVariantId: "canonical",
    capabilityFamily: "approval_gated_delete",
    userGoal: "repair the current package after approval",
    plannerEvidence: {
      summary: "normalized to delete capability",
      normalizedObjective: "delete src/approval-target.ts",
      normalizedCapabilityMarker: "apply_patch.delete_file",
      approvalRequiredActions: ["apply_patch.delete_file"],
    },
    approvalPathEvidence: {
      approvalRequestObserved: true,
      terminalMode: "completed",
      blockingReasonKind: "waiting_approval",
    },
    canonicalExpectedIntent: {
      capabilityFamily: "approval_gated_delete",
      toolName: "apply_patch",
      action: "delete_file",
    },
    threadId: "thread_real_1",
    runId: "run_active_id",
    taskId: "task_active_id",
    summary: baseComparable.terminalOutcome.summary,
    artifactContext: {
      currentWorkPackageId: "pkg_current",
      previousWorkPackageIds: ["pkg_previous"],
      visibleStateWorkPackageId: "pkg_current",
      generatedArtifactPath: "src/approval-target.ts",
      generatedArtifactWorkPackageId: "pkg_current",
    },
    pendingApprovalCount: 0,
    unknownAfterCrashCount: 0,
    milestones: [
      {
        kind: "approval_requested",
        approvalRequestId: "approval_1_id",
        summary: "apply_patch delete_file src/approval-target.ts",
        toolName: "apply_patch",
      },
      {
        kind: "approval_resolved",
        approvalRequestId: "approval_1_id",
        resolution: "approved",
        summary: "approval granted",
      },
      {
        kind: "resume_boundary",
        summary: "returned to graph",
      },
      {
        kind: "side_effect",
        summary: "apply_patch completed",
        toolName: "apply_patch",
      },
      {
        kind: "terminal",
        summary: baseComparable.terminalOutcome.summary,
      },
    ],
    comparable: baseComparable,
    ...overrides,
  });
}

describe("real-eval evaluation", () => {
  test("passes one primary outcome check and one primary trajectory rule for each scenario family", () => {
    const approval = evaluateRealTrace(createBaseTrace());

    const rejection = evaluateRealTrace(createBaseTrace({
      scenarioId: "reject-and-replan-task-loop",
      comparable: {
        ...createBaseTrace().comparable,
        terminalOutcome: {
          ...createBaseTrace().comparable.terminalOutcome,
          summary: "Replanned and completed with safer path",
        },
        approvalFlow: {
          ...createBaseTrace().comparable.approvalFlow,
          resolution: "rejected",
          reroutedToPlanner: true,
        },
        sideEffects: {
          ...createBaseTrace().comparable.sideEffects,
          totalEntries: 0,
          completedEntries: [],
        },
      },
      milestones: [
        {
          kind: "approval_requested",
          approvalRequestId: "approval_1_id",
          summary: "apply_patch delete_file src/approval-target.ts",
          toolName: "apply_patch",
        },
        {
          kind: "approval_resolved",
          approvalRequestId: "approval_1_id",
          resolution: "rejected",
          summary: "approval rejected",
        },
        {
          kind: "replan_entry",
          summary: "resume by replanning",
        },
        {
          kind: "resume_boundary",
          summary: "re-entered the graph",
        },
        {
          kind: "terminal",
          summary: "Replanned and completed with safer path",
        },
      ],
    }));

    const artifact = evaluateRealTrace(createBaseTrace({
      scenarioId: "artifact-current-package-loop",
      capabilityFamily: "artifact_current_package",
      canonicalExpectedIntent: {
        capabilityFamily: "artifact_current_package",
        toolName: "respond",
        action: "generate_artifact",
      },
      plannerEvidence: {
        summary: "normalized to current package artifact generation",
        normalizedObjective: "generate artifact for the current package",
        normalizedCapabilityMarker: "respond.generate_artifact",
        approvalRequiredActions: [],
      },
      approvalPathEvidence: {
        approvalRequestObserved: false,
        terminalMode: "completed",
      },
      comparable: {
        ...createBaseTrace().comparable,
        approvalFlow: {
          ...createBaseTrace().comparable.approvalFlow,
          requested: [],
          resolution: "none",
          graphResumeDetected: false,
        },
      },
      milestones: [
        {
          kind: "side_effect",
          summary: "artifact generated",
          toolName: "respond",
        },
        {
          kind: "terminal",
          summary: "Artifact generated for pkg_current",
        },
      ],
    }));

    const interrupt = evaluateRealTrace(createBaseTrace({
      scenarioId: "interrupt-resume-work-loop",
      comparable: {
        ...createBaseTrace().comparable,
        terminalOutcome: {
          ...createBaseTrace().comparable.terminalOutcome,
          latestRunStatus: "running",
          latestTaskStatus: "blocked",
          summary: "Recovered and remains explicitly blocked",
        },
        approvalFlow: {
          ...createBaseTrace().comparable.approvalFlow,
          requested: [],
          resolution: "none",
          graphResumeDetected: false,
        },
        recoveryFlow: {
          ...createBaseTrace().comparable.recoveryFlow,
          humanRecoveryTriggered: true,
          uncertainExecutionCount: 0,
          blockedTaskAliases: ["task_active"],
        },
        sideEffects: {
          ...createBaseTrace().comparable.sideEffects,
          totalEntries: 0,
          completedEntries: [],
        },
      },
      milestones: [
        {
          kind: "recovery_boundary",
          summary: "recovered after interruption",
        },
        {
          kind: "resume_boundary",
          summary: "resume boundary crossed",
        },
        {
          kind: "terminal",
          summary: "Recovered and remains explicitly blocked",
        },
      ],
      artifactContext: {
        currentWorkPackageId: "pkg_current",
        previousWorkPackageIds: ["pkg_previous"],
        visibleStateWorkPackageId: "pkg_current",
      },
      pendingApprovalCount: 0,
      unknownAfterCrashCount: 0,
    }));

    expect(approval.status).toBe("passed");
    expect(rejection.status).toBe("passed");
    expect(artifact.status).toBe("passed");
    expect(interrupt.status).toBe("passed");

    expect(approval.outcomeResults.map((result) => result.id)).toContain("outcome.capability_family_matches_expected_intent");
    expect(approval.outcomeResults.map((result) => result.id)).toContain("outcome.approved_execution_completes_after_graph_return");
    expect(approval.trajectoryResults.map((result) => result.id)).toContain("trajectory.no_graph_bypass_after_approval");
    expect(rejection.outcomeResults.map((result) => result.id)).toContain("outcome.rejected_execution_reenters_replan_resume");
    expect(rejection.trajectoryResults.map((result) => result.id)).toContain("trajectory.no_control_plane_short_circuit_after_rejection");
    expect(artifact.outcomeResults.map((result) => result.id)).toContain("outcome.generated_artifact_belongs_to_current_work_package");
    expect(artifact.trajectoryResults.map((result) => result.id)).toContain("trajectory.no_artifact_truth_leakage_from_previous_package");
    expect(interrupt.outcomeResults.map((result) => result.id)).toContain("outcome.resumed_execution_reaches_expected_state");
    expect(interrupt.trajectoryResults.map((result) => result.id)).toContain("trajectory.no_duplicate_side_effects_or_visible_state_drift_after_recovery");
  });

  test("fails the family-level consistency check when the observed capability path drifts", () => {
    const evaluation = evaluateRealTrace(createBaseTrace({
      promptVariantId: "polite",
      comparable: {
        ...createBaseTrace().comparable,
        approvalFlow: {
          ...createBaseTrace().comparable.approvalFlow,
          requested: [
            {
              ...createBaseTrace().comparable.approvalFlow.requested[0]!,
              toolName: "exec",
              action: undefined,
            },
          ],
        },
      },
      milestones: [
        {
          kind: "approval_requested",
          approvalRequestId: "approval_1_id",
          summary: "exec rm src/approval-target.ts",
          toolName: "exec",
        },
        {
          kind: "approval_resolved",
          approvalRequestId: "approval_1_id",
          resolution: "approved",
          summary: "approval granted",
        },
        {
          kind: "resume_boundary",
          summary: "returned to graph",
        },
        {
          kind: "terminal",
          summary: "Completed with a mismatched capability path",
        },
      ],
    }));

    expect(evaluation.status).toBe("failed");
    expect(
      evaluation.outcomeResults.find((result) => result.id === "outcome.capability_family_matches_expected_intent")?.status,
    ).toBe("failed");
  });

  test("marks ambiguous recovery drift as suspicious instead of silently passing", () => {
    const evaluation = evaluateRealTrace(createBaseTrace({
      scenarioId: "interrupt-resume-work-loop",
      comparable: {
        ...createBaseTrace().comparable,
        terminalOutcome: {
          ...createBaseTrace().comparable.terminalOutcome,
          latestRunStatus: "running",
          latestTaskStatus: "blocked",
          summary: "Recovered but visible state drifted",
        },
        approvalFlow: {
          ...createBaseTrace().comparable.approvalFlow,
          requested: [],
          resolution: "none",
          graphResumeDetected: false,
        },
        recoveryFlow: {
          ...createBaseTrace().comparable.recoveryFlow,
          humanRecoveryTriggered: true,
          uncertainExecutionCount: 1,
          blockedTaskAliases: ["task_active"],
        },
        sideEffects: {
          ...createBaseTrace().comparable.sideEffects,
          unknownAfterCrashCount: 1,
          completedEntries: [],
          totalEntries: 0,
        },
      },
      milestones: [
        {
          kind: "recovery_boundary",
          summary: "recovered after interruption",
        },
        {
          kind: "resume_boundary",
          summary: "resume boundary crossed",
        },
        {
          kind: "terminal",
          summary: "Recovered but visible state drifted",
        },
      ],
      artifactContext: {
        currentWorkPackageId: "pkg_current",
        previousWorkPackageIds: ["pkg_previous"],
        visibleStateWorkPackageId: "pkg_previous",
        generatedArtifactPath: "src/approval-target.ts",
        generatedArtifactWorkPackageId: "pkg_previous",
      },
      unknownAfterCrashCount: 1,
    }));

    expect(evaluation.status).toBe("suspicious");
    expect(evaluation.trajectoryResults).toContainEqual(
      expect.objectContaining({
        id: "trajectory.no_duplicate_side_effects_or_visible_state_drift_after_recovery",
        status: "suspicious",
      }),
    );
  });

  test("high-severity control-flow override keeps the run out of passed status", () => {
    const evaluation = evaluateRealTrace(createBaseTrace({
      comparable: {
        ...createBaseTrace().comparable,
        approvalFlow: {
          ...createBaseTrace().comparable.approvalFlow,
          graphResumeDetected: false,
        },
      },
      milestones: [
        {
          kind: "approval_requested",
          approvalRequestId: "approval_1_id",
          summary: "apply_patch delete_file src/approval-target.ts",
          toolName: "apply_patch",
        },
        {
          kind: "approval_resolved",
          approvalRequestId: "approval_1_id",
          resolution: "approved",
          summary: "approval granted",
        },
        {
          kind: "side_effect",
          summary: "apply_patch completed outside the graph",
          toolName: "apply_patch",
        },
        {
          kind: "terminal",
          summary: "Deleted src/approval-target.ts without resuming graph",
        },
      ],
    }));

    expect(evaluation.status).toBe("failed");
    expect(evaluation.reviewItems).toContainEqual(
      expect.objectContaining({
        scenarioId: "approval-gated-bugfix-loop",
        runId: "run_active_id",
        failureClass: "approval_control_failure",
        rootCauseLayer: "approval_runtime",
        severity: "high",
        nextSuggestedAction: expect.stringContaining("resume"),
      }),
    );
  });

  test("fails artifact ownership using structured trace fields instead of summary text", () => {
    const evaluation = evaluateRealTrace(createBaseTrace({
      scenarioId: "artifact-current-package-loop",
      capabilityFamily: "artifact_current_package",
      summary: "Artifact summary without package hints",
      canonicalExpectedIntent: {
        capabilityFamily: "artifact_current_package",
        toolName: "respond",
        action: "generate_artifact",
      },
      plannerEvidence: {
        summary: "normalized to current package artifact generation",
        normalizedObjective: "generate artifact for the current package",
        normalizedCapabilityMarker: "respond.generate_artifact",
        approvalRequiredActions: [],
      },
      approvalPathEvidence: {
        approvalRequestObserved: false,
        terminalMode: "completed",
      },
      comparable: {
        ...createBaseTrace().comparable,
        terminalOutcome: {
          ...createBaseTrace().comparable.terminalOutcome,
          summary: "Artifact summary without package hints",
        },
        runLineage: createBaseTrace().comparable.runLineage.map((entry) => ({
          ...entry,
          summary: "artifact work completed",
          inputText: undefined,
        })),
        taskLineage: createBaseTrace().comparable.taskLineage.map((entry) => ({
          ...entry,
          summary: "artifact work completed",
        })),
        approvalFlow: {
          ...createBaseTrace().comparable.approvalFlow,
          requested: [],
          resolution: "none",
          graphResumeDetected: false,
        },
      },
      artifactContext: {
        currentWorkPackageId: "pkg_current",
        previousWorkPackageIds: ["pkg_previous"],
        visibleStateWorkPackageId: "pkg_current",
        generatedArtifactPath: "src/approval-target.ts",
        generatedArtifactWorkPackageId: "pkg_previous",
      },
      milestones: [
        {
          kind: "side_effect",
          summary: "artifact generated",
          toolName: "respond",
        },
        {
          kind: "terminal",
          summary: "Artifact summary without package hints",
        },
      ],
    }));

    expect(
      evaluation.outcomeResults.find((result) => result.id === "outcome.generated_artifact_belongs_to_current_work_package")?.status,
    ).toBe("failed");
    expect(
      evaluation.trajectoryResults.find((result) => result.id === "trajectory.no_artifact_truth_leakage_from_previous_package")?.status,
    ).toBe("failed");
  });

  test("passes interrupt recovery when the resumed run completes cleanly", () => {
    const evaluation = evaluateRealTrace(createBaseTrace({
      scenarioId: "interrupt-resume-work-loop",
      promptVariantId: "complete-after-resume",
      comparable: {
        ...createBaseTrace().comparable,
        terminalOutcome: {
          ...createBaseTrace().comparable.terminalOutcome,
          latestRunStatus: "completed",
          latestTaskStatus: "completed",
          summary: "Recovered and completed after resume",
        },
        approvalFlow: {
          ...createBaseTrace().comparable.approvalFlow,
          requested: [],
          resolution: "none",
          graphResumeDetected: false,
        },
        recoveryFlow: {
          ...createBaseTrace().comparable.recoveryFlow,
          humanRecoveryTriggered: true,
          blockedTaskAliases: [],
        },
        sideEffects: {
          ...createBaseTrace().comparable.sideEffects,
          totalEntries: 0,
          completedEntries: [],
        },
      },
      milestones: [
        { kind: "recovery_boundary", summary: "interrupted during live execution" },
        { kind: "resume_boundary", summary: "resumed with user input" },
        { kind: "terminal", summary: "Recovered and completed after resume" },
      ],
      artifactContext: {
        currentWorkPackageId: "pkg_current",
        previousWorkPackageIds: ["pkg_previous"],
        visibleStateWorkPackageId: "pkg_current",
      },
      pendingApprovalCount: 0,
      unknownAfterCrashCount: 0,
    }));

    expect(evaluation.status).toBe("passed");
    expect(
      evaluation.outcomeResults.find((result) => result.id === "outcome.resumed_execution_reaches_expected_state")?.status,
    ).toBe("passed");
  });
});
