import { describe, expect, test } from "bun:test";
import { enqueueReviewItems, evaluateOutcome, evaluateTrajectory } from "../../src/eval/evaluation";
import { evalComparableRunSchema, type EvalScenario } from "../../src/eval/eval-schema";

const baseComparable = evalComparableRunSchema.parse({
    runtimeRefs: {
      threadId: "thread_1",
      runs: { run_1: "run_1" },
      tasks: { task_1: "task_1" },
      approvals: { approval_1: "approval_1" },
      toolCalls: { tool_call_1: "task_1:apply_patch" },
    },
  terminalOutcome: {
    threadStatus: "active",
    latestRunAlias: "run_1",
    latestRunStatus: "completed",
    latestTaskAlias: "task_1",
    latestTaskStatus: "completed",
    pendingApprovalCount: 0,
    summary: "Deleted approved.txt",
  },
  runLineage: [
    {
      alias: "run_1",
      trigger: "user_input",
      status: "completed",
      activeTaskAlias: "task_1",
    },
  ],
  taskLineage: [
    {
      alias: "task_1",
      runAlias: "run_1",
      status: "completed",
      summary: "Delete approved file",
    },
  ],
  approvalFlow: {
    requested: [
      {
        alias: "approval_1",
        runAlias: "run_1",
        taskAlias: "task_1",
        status: "approved",
        summary: "apply_patch delete_file approved.txt",
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
    resumedRunAliases: [],
  },
  sideEffects: {
    totalEntries: 1,
    unknownAfterCrashCount: 0,
    completedEntries: [
      {
        taskAlias: "task_1",
        runAlias: "run_1",
        toolCallAlias: "tool_call_1",
        toolName: "apply_patch",
        status: "completed",
      },
    ],
    duplicateCompletedToolCallAliases: [],
  },
  eventMilestones: {
    eventTypes: ["task.created", "task.started", "tool.executed", "task.completed"],
    toolExecutedCount: 1,
    toolFailedCount: 0,
    threadBlockedCount: 0,
    taskCompletedCount: 1,
    taskFailedCount: 0,
    taskUpdatedBlockedCount: 0,
  },
});

const approvedScenario: EvalScenario = {
  id: "approval-approved",
  version: 1,
  family: "approval-required",
  summary: "approval resumes and completes through the run-loop",
  setup: "seed approved file and planner result",
  steps: ["start root task", "pause on approval", "approve request"],
  expectedControlSemantics: {
    requiresApproval: true,
    expectedDecision: "approved",
    expectedGraphResume: true,
    expectedRecoveryMode: "none",
  },
  expectedOutcome: {
    terminalRunStatus: "completed",
    terminalTaskStatus: "completed",
    expectedSummaryIncludes: ["Deleted approved.txt"],
    expectedApprovalCount: 1,
    expectedPendingApprovalCount: 0,
    expectedToolCallCount: 1,
  },
  createModelGateway() {
    throw new Error("not used in evaluation unit tests");
  },
  async run() {
    throw new Error("not used in evaluation unit tests");
  },
};

describe("evaluateOutcome / evaluateTrajectory", () => {
  test("passes deterministic checks for a healthy approval flow", () => {
    const outcome = evaluateOutcome(approvedScenario, baseComparable);
    const trajectory = evaluateTrajectory(approvedScenario, baseComparable);

    expect(outcome.every((result) => result.status === "passed")).toBe(true);
    expect(trajectory.every((result) => result.status === "passed")).toBe(true);
  });

  test("creates review items for failed or suspicious results", () => {
    const failingComparable = {
      ...baseComparable,
      approvalFlow: {
        ...baseComparable.approvalFlow,
        graphResumeDetected: false,
      },
      sideEffects: {
        ...baseComparable.sideEffects,
        duplicateCompletedToolCallAliases: ["tool_call_1"],
      },
    };

    const outcome = evaluateOutcome(approvedScenario, failingComparable);
    const trajectory = evaluateTrajectory(approvedScenario, failingComparable);
    const reviewItems = enqueueReviewItems({
      scenarioId: approvedScenario.id,
      scenarioRunId: "scenario_run_1",
      outcomeResults: outcome,
      trajectoryResults: trajectory,
      comparable: failingComparable,
    });

    expect(trajectory.some((result) => result.status === "failed")).toBe(true);
    expect(reviewItems).toHaveLength(2);
    expect(reviewItems.map((item) => item.sourceId)).toEqual(
      expect.arrayContaining(["trajectory.run_loop_resume", "trajectory.duplicate_side_effect"]),
    );
  });

  test("detects resumed-control regressions around rejection, lineage, and repeated blocking", () => {
    const rejectionRecoveryScenario: EvalScenario = {
      ...approvedScenario,
      id: "rejection-recovery",
      expectedControlSemantics: {
        requiresApproval: true,
        expectedDecision: "rejected",
        expectedGraphResume: false,
        expectedRecoveryMode: "human_recovery",
      },
    };

    const resumedComparable = evalComparableRunSchema.parse({
      ...baseComparable,
      runLineage: [
        {
          alias: "run_1",
          trigger: "interrupt_resume",
          status: "completed",
          activeTaskAlias: "task_1",
        },
      ],
      taskLineage: [
        {
          alias: "task_1",
          runAlias: "run_missing",
          status: "completed",
          summary: "Resume once safely",
        },
      ],
      approvalFlow: {
        ...baseComparable.approvalFlow,
        resolution: "rejected",
        reroutedToPlanner: false,
      },
      recoveryFlow: {
        ...baseComparable.recoveryFlow,
        humanRecoveryTriggered: true,
        interruptedRunAliases: ["run_1"],
        resumedRunAliases: ["run_1", "run_2"],
        blockedTaskAliases: [],
      },
      sideEffects: {
        ...baseComparable.sideEffects,
        completedEntries: [
          {
            taskAlias: "task_1",
            runAlias: "run_1",
            toolCallAlias: "tool_call_1",
            toolName: "apply_patch",
            status: "completed",
          },
        ],
      },
    });

    const trajectory = evaluateTrajectory(rejectionRecoveryScenario, resumedComparable);

    expect(trajectory.filter((result) => result.status === "failed").map((result) => result.id)).toEqual(
      expect.arrayContaining([
        "trajectory.rejection_replan",
        "trajectory.rejection_shortcut",
        "trajectory.resume_lineage_stability",
        "trajectory.repeated_blocked_recovery",
      ]),
    );
  });
});
