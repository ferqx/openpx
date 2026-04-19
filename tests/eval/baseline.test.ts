import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  compareScenarioToBaseline,
  loadEvalBaseline,
  writeScenarioBaseline,
} from "../../src/eval/baseline";
import { evalComparableRunSchema, type EvalScenarioResult } from "../../src/eval/eval-schema";

const comparable = evalComparableRunSchema.parse({
  runtimeRefs: {
    threadId: "thread_live",
    runs: { run_1: "run_live" },
    tasks: { task_1: "task_live" },
    approvals: { approval_1: "approval_live" },
    toolCalls: { tool_call_1: "task_live:apply_patch" },
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

function createScenarioResult(overrides: Partial<EvalScenarioResult> = {}): EvalScenarioResult {
  return {
    scenarioRunId: "scenario_run_live",
    suiteRunId: "suite_run_live",
    scenarioId: "approval-required-then-approved",
    scenarioVersion: 1,
    family: "approval-required",
    status: "passed",
    threadId: "thread_live",
    primaryRunId: "run_live",
    primaryTaskId: "task_live",
    comparable,
    outcomeResults: [
      {
        id: "outcome.summary",
        status: "passed",
        message: "summary includes Deleted approved.txt",
        objectRefs: {
          threadId: "thread_live",
          runIds: ["run_live"],
          taskIds: ["task_live"],
          approvalIds: ["approval_live"],
        },
      },
    ],
    trajectoryResults: [
      {
        id: "trajectory.run_loop_resume",
        status: "passed",
        message: "run-loop resume matched expected behavior",
        objectRefs: {
          threadId: "thread_live",
          runIds: ["run_live"],
          taskIds: ["task_live"],
          approvalIds: ["approval_live"],
        },
      },
    ],
    createdAt: "2026-04-09T00:00:00.000Z",
    completedAt: "2026-04-09T00:00:01.000Z",
    ...overrides,
  };
}

describe("eval baseline", () => {
  test("round-trips a scenario baseline and compares stable fields", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-baseline-"));
    const baselineRootDir = path.join(rootDir, "baselines");
    const result = createScenarioResult();

    await writeScenarioBaseline({
      baselineRootDir,
      suiteId: "core-eval-suite",
      result,
    });

    const loaded = await loadEvalBaseline({
      baselineRootDir,
      suiteId: "core-eval-suite",
      scenarioId: result.scenarioId,
      scenarioVersion: result.scenarioVersion,
    });

    expect(loaded.kind).toBe("scenario");
    if (loaded.kind !== "scenario") {
      throw new Error("expected scenario baseline");
    }

    const diff = compareScenarioToBaseline({
      baseline: loaded.baseline,
      result,
    });

    expect(diff.status).toBe("matched");
    expect(diff.differences).toHaveLength(0);

    await fs.rm(rootDir, { recursive: true, force: true });
  });

  test("ignores runtime ids, timestamps, and absolute paths during compare", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-baseline-"));
    const baselineRootDir = path.join(rootDir, "baselines");
    const result = createScenarioResult();

    await writeScenarioBaseline({
      baselineRootDir,
      suiteId: "core-eval-suite",
      result,
    });

    const loaded = await loadEvalBaseline({
      baselineRootDir,
      suiteId: "core-eval-suite",
      scenarioId: result.scenarioId,
      scenarioVersion: result.scenarioVersion,
    });

    if (loaded.kind !== "scenario") {
      throw new Error("expected scenario baseline");
    }

    const diff = compareScenarioToBaseline({
      baseline: loaded.baseline,
      result: createScenarioResult({
        scenarioRunId: "scenario_run_other",
        suiteRunId: "suite_run_other",
        threadId: "thread_other",
        primaryRunId: "run_other",
        primaryTaskId: "task_other",
        createdAt: "2026-04-10T00:00:00.000Z",
        completedAt: "2026-04-10T00:00:01.000Z",
        comparable: {
          ...comparable,
          runtimeRefs: {
            threadId: "thread_other",
            runs: { run_1: "run_other" },
            tasks: { task_1: "task_other" },
            approvals: { approval_1: "approval_other" },
            toolCalls: { tool_call_1: "/tmp/other/workspace/approved.txt" },
          },
        },
        outcomeResults: [
          {
            id: "outcome.summary",
            status: "passed",
            message: "summary includes Deleted approved.txt",
            objectRefs: {
              threadId: "thread_other",
              runIds: ["run_other"],
              taskIds: ["task_other"],
              approvalIds: ["approval_other"],
            },
          },
        ],
        trajectoryResults: [
          {
            id: "trajectory.run_loop_resume",
            status: "passed",
            message: "run-loop resume matched expected behavior",
            objectRefs: {
              threadId: "thread_other",
              runIds: ["run_other"],
              taskIds: ["task_other"],
              approvalIds: ["approval_other"],
            },
          },
        ],
      }),
    });

    expect(diff.status).toBe("matched");
    expect(diff.differences).toHaveLength(0);

    await fs.rm(rootDir, { recursive: true, force: true });
  });

  test("reports structured regressions when stable comparable fields differ", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-baseline-"));
    const baselineRootDir = path.join(rootDir, "baselines");
    const result = createScenarioResult();

    await writeScenarioBaseline({
      baselineRootDir,
      suiteId: "core-eval-suite",
      result,
    });

    const loaded = await loadEvalBaseline({
      baselineRootDir,
      suiteId: "core-eval-suite",
      scenarioId: result.scenarioId,
      scenarioVersion: result.scenarioVersion,
    });

    if (loaded.kind !== "scenario") {
      throw new Error("expected scenario baseline");
    }

    const diff = compareScenarioToBaseline({
      baseline: loaded.baseline,
      result: createScenarioResult({
        comparable: {
          ...comparable,
          approvalFlow: {
            ...comparable.approvalFlow,
            graphResumeDetected: false,
          },
        },
      }),
    });

    expect(diff.status).toBe("regressed");
    expect(diff.differences.map((item) => item.field)).toContain("comparable");

    await fs.rm(rootDir, { recursive: true, force: true });
  });
});
