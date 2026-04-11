import { describe, expect, test } from "bun:test";
import { SqliteEvalStore } from "../../src/persistence/sqlite/sqlite-eval-store";
import { createRealReviewQueueItems, listPersistedRealReviewItems, persistRealReviewQueueItems } from "../../src/real-eval/review-queue";
import { evaluateRealTrace } from "../../src/real-eval/evaluation";
import { realRunTraceSchema } from "../../src/real-eval/real-eval-schema";
import type { EvalStorePort, EvalReviewQueueRecord } from "../../src/persistence/ports/eval-store-port";

const reviewTrace = realRunTraceSchema.parse({
  scenarioId: "reject-and-replan-task-loop",
  promptVariantId: "canonical",
  capabilityFamily: "reject_replan_delete",
  userGoal: "keep working after rejection",
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
  threadId: "thread_review_1",
  runId: "run_review_1",
  taskId: "task_review_1",
  artifactContext: {
    currentWorkPackageId: "pkg_safe_replan",
    previousWorkPackageIds: ["pkg_delete"],
  },
  pendingApprovalCount: 0,
  unknownAfterCrashCount: 0,
  summary: "Rejected control step terminated instead of replanning",
  milestones: [
    {
      kind: "approval_requested",
      approvalRequestId: "approval_review_1",
      summary: "apply_patch delete_file src/approval-target.ts",
      toolName: "apply_patch",
    },
    {
      kind: "approval_resolved",
      approvalRequestId: "approval_review_1",
      resolution: "rejected",
      summary: "approval rejected",
    },
    {
      kind: "terminal",
      summary: "Rejected control step terminated instead of replanning",
    },
  ],
  comparable: {
    runtimeRefs: {
      threadId: "thread_review_1",
      runs: {
        run_initial: "run_review_1",
      },
      tasks: {
        task_active: "task_review_1",
      },
      approvals: {
        approval_1: "approval_review_1",
      },
      toolCalls: {},
    },
    terminalOutcome: {
      threadStatus: "active",
      latestRunAlias: "run_initial",
      latestRunStatus: "completed",
      latestTaskAlias: "task_active",
      latestTaskStatus: "completed",
      pendingApprovalCount: 0,
      summary: "Rejected control step terminated instead of replanning",
    },
    runLineage: [
      {
        alias: "run_initial",
        trigger: "user_input",
        status: "completed",
        activeTaskAlias: "task_active",
        summary: "terminated after rejection",
      },
    ],
    taskLineage: [
      {
        alias: "task_active",
        runAlias: "run_initial",
        status: "completed",
        summary: "apply package change to src/approval-target.ts",
      },
    ],
    approvalFlow: {
      requested: [
        {
          alias: "approval_1",
          runAlias: "run_initial",
          taskAlias: "task_active",
          status: "rejected",
          summary: "apply_patch delete_file src/approval-target.ts",
          toolName: "apply_patch",
          action: "delete_file",
        },
      ],
      resolution: "rejected",
      rejectionReason: "Need a safer path",
      graphResumeDetected: false,
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
      totalEntries: 0,
      unknownAfterCrashCount: 0,
      completedEntries: [],
      duplicateCompletedToolCallAliases: [],
    },
    eventMilestones: {
      eventTypes: ["approval.requested", "approval.rejected", "run.completed"],
      toolExecutedCount: 0,
      toolFailedCount: 0,
      threadBlockedCount: 0,
      taskCompletedCount: 1,
      taskFailedCount: 0,
      taskUpdatedBlockedCount: 0,
    },
  },
});

describe("real-eval review queue", () => {
  test("creates review items with the required V0 fields", () => {
    const evaluation = evaluateRealTrace(reviewTrace);
    const items = createRealReviewQueueItems({
      scenarioRunId: "scenario_run_review_1",
      trace: reviewTrace,
      evaluation,
    });

    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toEqual(
      expect.objectContaining({
        scenarioId: "reject-and-replan-task-loop",
        runId: "run_review_1",
        failureClass: "rejection_control_failure",
        rootCauseLayer: "approval_runtime",
        impactedObject: "run:run_review_1",
        severity: "high",
        nextSuggestedAction: expect.stringContaining("replan"),
      }),
    );
  });

  test("persists suspicious and failed real review items through the existing eval queue store", async () => {
    const store = new SqliteEvalStore(":memory:");
    const evaluation = evaluateRealTrace(reviewTrace);
    const saved = await persistRealReviewQueueItems({
      store,
      scenarioRunId: "scenario_run_review_1",
      trace: reviewTrace,
      evaluation,
    });

    expect(saved.length).toBeGreaterThan(0);

    const loaded = await listPersistedRealReviewItems({
      store,
      scenarioId: "reject-and-replan-task-loop",
    });
    expect(loaded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scenarioId: "reject-and-replan-task-loop",
          runId: "run_review_1",
          failureClass: "rejection_control_failure",
          evolutionTarget: "approval_runtime",
        }),
      ]),
    );

    await store.close();
  });

  test("writes base review rows and metadata atomically", async () => {
    const evaluation = evaluateRealTrace(reviewTrace);
    const persistedRecords: EvalReviewQueueRecord[] = [];

    const store: EvalStorePort = {
      async saveSuiteRun() {},
      async getSuiteRun() { return undefined; },
      async saveScenarioResult() {},
      async listScenarioResultsBySuiteRun() { return []; },
      async saveReviewItem() {
        throw new Error("should not use split review-item writes");
      },
      async saveReviewRecords(records) {
        persistedRecords.push(...records);
        throw new Error("atomic write failed");
      },
      async getReviewItem() { return undefined; },
      async listReviewItems() { return []; },
      async listReviewRecords() { return []; },
      async updateReviewItem() {
        throw new Error("not needed");
      },
      async close() {},
    };

    await expect(
      persistRealReviewQueueItems({
        store,
        scenarioRunId: "scenario_run_review_1",
        trace: reviewTrace,
        evaluation,
      }),
    ).rejects.toThrow("atomic write failed");

    expect(typeof persistedRecords[0]?.metadataJson).toBe("string");
    expect(persistedRecords[0]?.metadataJson).toContain("\"failureClass\"");
  });

  test("skips queue rows whose metadata belongs to another lane", async () => {
    const store = new SqliteEvalStore(":memory:");

    await store.saveReviewRecords([
      {
        item: {
          reviewItemId: "review_other_lane",
          scenarioRunId: "scenario_run_other",
          scenarioId: "scenario-other",
          sourceType: "trajectory_rule",
          sourceId: "trajectory.other_lane",
          severity: "medium",
          triageStatus: "open",
          resolutionType: undefined,
          summary: "other lane metadata",
          objectRefs: {
            threadId: "thread_other",
            runIds: ["run_other"],
            taskIds: ["task_other"],
            approvalIds: [],
          },
          ownerNote: undefined,
          followUp: undefined,
          createdAt: "2026-04-11T00:00:00.000Z",
          closedAt: undefined,
        },
        metadataJson: JSON.stringify({
          version: 1,
          lane: "core-eval",
          note: "not a real-eval row",
        }),
      },
    ]);

    const evaluation = evaluateRealTrace(reviewTrace);
    await persistRealReviewQueueItems({
      store,
      scenarioRunId: "scenario_run_review_1",
      trace: reviewTrace,
      evaluation,
    });

    const loaded = await listPersistedRealReviewItems({ store });
    expect(loaded.every((item) => item.scenarioId === "reject-and-replan-task-loop")).toBe(true);
    expect(loaded.some((item) => item.scenarioId === "scenario-other")).toBe(false);

    await store.close();
  });
});
