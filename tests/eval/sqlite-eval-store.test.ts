import { describe, expect, test } from "bun:test";
import { SqliteEvalStore } from "../../src/persistence/sqlite/sqlite-eval-store";
import { evalComparableRunSchema } from "../../src/eval/eval-schema";

describe("SqliteEvalStore", () => {
  test("round-trips suite runs, scenario results, and review queue items", async () => {
    const store = new SqliteEvalStore(":memory:");

    const suiteRun = {
      suiteRunId: "suite_run_1",
      suiteId: "core-eval-suite",
      status: "completed" as const,
      startedAt: "2026-04-09T00:00:00.000Z",
      completedAt: "2026-04-09T00:01:00.000Z",
    };
    await store.saveSuiteRun(suiteRun);

    const comparable = evalComparableRunSchema.parse({
      runtimeRefs: {
        threadId: "thread_1",
        runs: { run_1: "run_1" },
        tasks: { task_1: "task_1" },
        approvals: {},
        toolCalls: {},
      },
      terminalOutcome: {
        threadStatus: "active",
        latestRunAlias: "run_1",
        latestRunStatus: "completed",
        latestTaskAlias: "task_1",
        latestTaskStatus: "completed",
        pendingApprovalCount: 0,
      },
      runLineage: [{ alias: "run_1", trigger: "user_input", status: "completed", activeTaskAlias: "task_1" }],
      taskLineage: [{ alias: "task_1", runAlias: "run_1", status: "completed", summary: "Do work" }],
      approvalFlow: {
        requested: [],
        resolution: "none",
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
        eventTypes: ["task.completed"],
        toolExecutedCount: 0,
        toolFailedCount: 0,
        threadBlockedCount: 0,
        taskCompletedCount: 1,
        taskFailedCount: 0,
        taskUpdatedBlockedCount: 0,
      },
    });

    await store.saveScenarioResult({
      scenarioRunId: "scenario_run_1",
      suiteRunId: suiteRun.suiteRunId,
      scenarioId: "happy-path",
      scenarioVersion: 1,
      family: "happy-path",
      status: "passed",
      threadId: "thread_1",
      primaryRunId: "run_1",
      primaryTaskId: "task_1",
      comparable,
      outcomeResults: [],
      trajectoryResults: [],
      createdAt: "2026-04-09T00:00:00.000Z",
      completedAt: "2026-04-09T00:01:00.000Z",
    });

    await store.saveReviewItem({
      reviewItemId: "review_1",
      scenarioRunId: "scenario_run_1",
      scenarioId: "happy-path",
      sourceType: "trajectory_rule",
      sourceId: "trajectory.graph_path",
      severity: "high",
      triageStatus: "open",
      resolutionType: undefined,
      summary: "graph path diverged",
      objectRefs: {
        threadId: "thread_1",
        runIds: ["run_1"],
        taskIds: ["task_1"],
        approvalIds: [],
      },
      ownerNote: undefined,
      followUp: undefined,
      createdAt: "2026-04-09T00:01:00.000Z",
      closedAt: undefined,
    });

    const loadedSuiteRun = await store.getSuiteRun(suiteRun.suiteRunId);
    const loadedScenarioResults = await store.listScenarioResultsBySuiteRun(suiteRun.suiteRunId);
    const loadedReviewItems = await store.listReviewItems();

    expect(loadedSuiteRun).toEqual(suiteRun);
    expect(loadedScenarioResults).toHaveLength(1);
    expect(loadedScenarioResults[0]?.comparable.runtimeRefs.threadId).toBe("thread_1");
    expect(loadedReviewItems).toHaveLength(1);
    expect(loadedReviewItems[0]?.sourceId).toBe("trajectory.graph_path");

    await store.updateReviewItem({
      reviewItemId: "review_1",
      triageStatus: "closed",
      resolutionType: "rule",
      ownerNote: "Added a trajectory rule for this control-flow divergence.",
      followUp: {
        kind: "rule",
        ruleId: "trajectory.resume_lineage_stability",
        ruleKind: "trajectory_rule",
      },
      closedAt: "2026-04-09T00:02:00.000Z",
    });

    const openItems = await store.listReviewItems({ triageStatus: "open" });
    const closedItems = await store.listReviewItems({ triageStatus: "closed" });
    const loadedReviewItem = await store.getReviewItem("review_1");

    expect(openItems).toHaveLength(0);
    expect(closedItems).toHaveLength(1);
    expect(loadedReviewItem?.triageStatus).toBe("closed");
    expect(loadedReviewItem?.resolutionType).toBe("rule");
    expect(loadedReviewItem?.ownerNote).toContain("trajectory rule");
    expect(loadedReviewItem?.followUp).toEqual({
      kind: "rule",
      ruleId: "trajectory.resume_lineage_stability",
      ruleKind: "trajectory_rule",
    });

    await store.close();
  });
});
