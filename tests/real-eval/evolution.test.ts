import { describe, expect, test } from "bun:test";
import { classifyRealEvalExecution } from "../../src/real-eval/evolution";
import { realEvalScenarioResultSchema, realRunTraceSchema, type RealRunTrace } from "../../src/real-eval/real-eval-schema";
import { evaluateRealTrace } from "../../src/real-eval/evaluation";
import { findRealEvalScenario } from "../../src/real-eval/scenarios";

function createApprovalTrace(overrides?: Partial<RealRunTrace>): RealRunTrace {
  return realRunTraceSchema.parse({
    scenarioId: "approval-gated-bugfix-loop",
    promptVariantId: "canonical",
    capabilityFamily: "approval_gated_delete",
    userGoal: "delete approval target after approval",
    plannerEvidence: {
      summary: "normalized to delete capability",
      normalizedObjective: "delete src/approval-target.ts",
      normalizedCapabilityMarker: "apply_patch.delete_file",
      approvalRequiredActions: ["apply_patch.delete_file"],
    },
    approvalPathEvidence: {
      approvalRequestObserved: true,
      terminalMode: "waiting_approval",
      blockingReasonKind: "waiting_approval",
    },
    canonicalExpectedIntent: {
      capabilityFamily: "approval_gated_delete",
      toolName: "apply_patch",
      action: "delete_file",
    },
    threadId: "thread_evolution",
    runId: "run_evolution",
    taskId: "task_evolution",
    pendingApprovalCount: 1,
    unknownAfterCrashCount: 0,
    milestones: [
      {
        kind: "approval_requested",
        approvalRequestId: "approval_1",
        summary: "apply_patch delete_file src/approval-target.ts",
        toolName: "apply_patch",
      },
      {
        kind: "terminal",
        summary: "waiting for approval",
      },
    ],
    comparable: {
      runtimeRefs: {
        threadId: "thread_evolution",
        runs: {
          run_initial: "run_evolution",
        },
        tasks: {
          task_active: "task_evolution",
        },
        approvals: {
          approval_1: "approval_1",
        },
        toolCalls: {},
      },
      terminalOutcome: {
        threadStatus: "active",
        latestRunAlias: "run_initial",
        latestRunStatus: "waiting_approval",
        latestTaskAlias: "task_active",
        latestTaskStatus: "blocked",
        pendingApprovalCount: 1,
        summary: "waiting for approval",
      },
      runLineage: [
        {
          alias: "run_initial",
          trigger: "user_input",
          status: "waiting_approval",
          activeTaskAlias: "task_active",
          blockingKind: "waiting_approval",
          inputText: "delete src/approval-target.ts",
        },
      ],
      taskLineage: [
        {
          alias: "task_active",
          runAlias: "run_initial",
          status: "blocked",
          summary: "delete src/approval-target.ts",
          blockingKind: "waiting_approval",
        },
      ],
      approvalFlow: {
        requested: [
          {
            alias: "approval_1",
            runAlias: "run_initial",
            taskAlias: "task_active",
            status: "pending",
            summary: "apply_patch delete_file src/approval-target.ts",
            toolName: "apply_patch",
            action: "delete_file",
          },
        ],
        resolution: "none",
        graphResumeDetected: false,
        reroutedToPlanner: false,
      },
      recoveryFlow: {
        humanRecoveryTriggered: false,
        uncertainExecutionCount: 0,
        blockedTaskAliases: ["task_active"],
        interruptedRunAliases: [],
        resumedRunAliases: [],
      },
      sideEffects: {
        totalEntries: 0,
        unknownAfterCrashCount: 0,
        completedEntries: [],
        duplicateCompletedToolCallAliases: [],
      },
      eventMilestones: {
        eventTypes: ["approval.requested"],
        toolExecutedCount: 0,
        toolFailedCount: 0,
        threadBlockedCount: 0,
        taskCompletedCount: 0,
        taskFailedCount: 0,
        taskUpdatedBlockedCount: 1,
      },
    },
    ...overrides,
  });
}

describe("real-eval evolution classification", () => {
  test("classifies sample failures without approval evidence as planner normalization failures", () => {
    const scenario = findRealEvalScenario("approval-gated-bugfix-loop");
    if (!scenario) {
      throw new Error("scenario missing");
    }

    const scenarioResult = realEvalScenarioResultSchema.parse({
      scenarioId: "approval-gated-bugfix-loop",
      scenarioVersion: 1,
      family: "approval-gated-bugfix-loop",
      capabilityFamily: "approval_gated_delete",
      status: "failed",
      promptVariantId: "polite",
      failureStage: "sample_execution",
      message: "approval-gated real sample never reached approval",
    });

    const candidates = classifyRealEvalExecution({
      scenario,
      scenarioResult,
      plannerEvidence: {
        summary: "responded conversationally instead of planning a delete capability",
        normalizedObjective: "respond to the user about approval",
        normalizedCapabilityMarker: "respond_only",
        approvalRequiredActions: [],
      },
      approvalPathEvidence: {
        approvalRequestObserved: false,
        terminalMode: "completed",
      },
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        scenarioId: "approval-gated-bugfix-loop",
        promptVariantId: "polite",
        capabilityFamily: "approval_gated_delete",
        failureClass: "planner_normalization_failure",
        evolutionTarget: "planner",
        promoteToRegression: "deterministic_eval",
        blockingMilestone: "M1",
      }),
    ]);
  });

  test("classifies missing approval objects after a normalized delete plan as approval control failures", () => {
    const scenario = findRealEvalScenario("approval-gated-bugfix-loop");
    if (!scenario) {
      throw new Error("scenario missing");
    }

    const scenarioResult = realEvalScenarioResultSchema.parse({
      scenarioId: "approval-gated-bugfix-loop",
      scenarioVersion: 1,
      family: "approval-gated-bugfix-loop",
      capabilityFamily: "approval_gated_delete",
      status: "failed",
      promptVariantId: "canonical",
      failureStage: "sample_execution",
      message: "approval-gated real sample never reached approval",
    });

    const candidates = classifyRealEvalExecution({
      scenario,
      scenarioResult,
      plannerEvidence: {
        summary: "normalized to delete capability",
        normalizedObjective: "delete src/approval-target.ts",
        normalizedCapabilityMarker: "apply_patch.delete_file",
        approvalRequiredActions: ["apply_patch.delete_file"],
      },
      approvalPathEvidence: {
        approvalRequestObserved: false,
        terminalMode: "waiting_approval",
        blockingReasonKind: "waiting_approval",
      },
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        failureClass: "approval_control_failure",
        evolutionTarget: "approval_runtime",
        promoteToRegression: "runtime_test",
      }),
    ]);
  });

  test("classifies evaluated rejection failures as rejection control failures", () => {
    const scenario = findRealEvalScenario("reject-and-replan-task-loop");
    if (!scenario) {
      throw new Error("scenario missing");
    }

    const trace = createApprovalTrace({
      scenarioId: "reject-and-replan-task-loop",
      capabilityFamily: "reject_replan_delete",
      promptVariantId: "constraint",
      plannerEvidence: {
        summary: "normalized to delete capability",
        normalizedObjective: "delete src/approval-target.ts",
        normalizedCapabilityMarker: "apply_patch.delete_file",
        approvalRequiredActions: ["apply_patch.delete_file"],
      },
      approvalPathEvidence: {
        approvalRequestObserved: true,
        terminalMode: "completed",
      },
      canonicalExpectedIntent: {
        capabilityFamily: "reject_replan_delete",
        toolName: "apply_patch",
        action: "delete_file",
      },
      comparable: {
        ...createApprovalTrace().comparable,
        terminalOutcome: {
          ...createApprovalTrace().comparable.terminalOutcome,
          latestRunStatus: "completed",
          latestTaskStatus: "completed",
          pendingApprovalCount: 0,
          summary: "Rejected and stopped",
        },
        approvalFlow: {
          ...createApprovalTrace().comparable.approvalFlow,
          resolution: "rejected",
          reroutedToPlanner: false,
          graphResumeDetected: false,
        },
        sideEffects: {
          ...createApprovalTrace().comparable.sideEffects,
          totalEntries: 0,
          completedEntries: [],
        },
      },
      milestones: [
        {
          kind: "approval_requested",
          approvalRequestId: "approval_1",
          summary: "apply_patch delete_file src/approval-target.ts",
          toolName: "apply_patch",
        },
        {
          kind: "approval_resolved",
          approvalRequestId: "approval_1",
          resolution: "rejected",
          summary: "rejected",
        },
        {
          kind: "terminal",
          summary: "Rejected and stopped",
        },
      ],
    });
    const evaluation = evaluateRealTrace(trace);
    const scenarioResult = realEvalScenarioResultSchema.parse({
      scenarioId: "reject-and-replan-task-loop",
      scenarioVersion: 1,
      family: "reject-and-replan-task-loop",
      capabilityFamily: "reject_replan_delete",
      status: "failed",
      promptVariantId: "constraint",
    });

    const candidates = classifyRealEvalExecution({
      scenario,
      scenarioResult,
      trace,
      evaluation,
    });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureClass: "rejection_control_failure",
          evolutionTarget: "approval_runtime",
        }),
      ]),
    );
  });

  test("classifies artifact ownership failures as artifact runtime failures", () => {
    const scenario = findRealEvalScenario("artifact-current-package-loop");
    if (!scenario) {
      throw new Error("scenario missing");
    }

    const trace = createApprovalTrace({
      scenarioId: "artifact-current-package-loop",
      capabilityFamily: "artifact_current_package",
      promptVariantId: "canonical",
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
      canonicalExpectedIntent: {
        capabilityFamily: "artifact_current_package",
        toolName: "respond",
        action: "generate_artifact",
      },
      artifactContext: {
        currentWorkPackageId: "pkg_current",
        previousWorkPackageIds: ["pkg_previous"],
        visibleStateWorkPackageId: "pkg_current",
        generatedArtifactPath: "src/approval-target.ts",
        generatedArtifactWorkPackageId: "pkg_previous",
      },
      comparable: {
        ...createApprovalTrace().comparable,
        approvalFlow: {
          ...createApprovalTrace().comparable.approvalFlow,
          requested: [],
          resolution: "none",
          graphResumeDetected: false,
        },
      },
      milestones: [
        { kind: "side_effect", summary: "artifact generated", toolName: "respond" },
        { kind: "terminal", summary: "artifact leaked from previous package" },
      ],
    });
    const evaluation = evaluateRealTrace(trace);
    const scenarioResult = realEvalScenarioResultSchema.parse({
      scenarioId: "artifact-current-package-loop",
      scenarioVersion: 1,
      family: "artifact-current-package-loop",
      capabilityFamily: "artifact_current_package",
      status: "failed",
      promptVariantId: "canonical",
    });

    const candidates = classifyRealEvalExecution({
      scenario,
      scenarioResult,
      trace,
      evaluation,
    });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureClass: "artifact_truth_failure",
          evolutionTarget: "artifact_runtime",
          promoteToRegression: "runtime_test",
        }),
      ]),
    );
  });
});
