import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { updateReviewQueueItemInputSchema } from "../../src/eval/eval-schema";
import {
  executeEvalReviewCommand,
  renderReviewQueueAggregateSummary,
  renderReviewQueueSummary,
  resolveEvalDataDir,
  summarizeReviewQueue,
} from "../../src/eval/review-queue";
import { runScenario } from "../../src/eval/scenario-runner";
import { coreEvalScenarios } from "../../src/eval/scenarios";
import { SqliteEvalStore } from "../../src/persistence/sqlite/sqlite-eval-store";
import { removeWithRetry } from "../helpers/fs-cleanup";

describe("eval review queue", () => {
  test("renders open items and supports closing them through the local review command", async () => {
    const baseScenario = coreEvalScenarios.find((item) => item.id === "capability-happy-path");
    if (!baseScenario) {
      throw new Error("capability-happy-path scenario not found");
    }

    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-review-cli-"));
    const dataDir = path.join(rootDir, "openpx.db");

    await runScenario({
      scenario: {
        ...baseScenario,
        id: "capability-happy-path-review-cli",
        expectedOutcome: {
          ...baseScenario.expectedOutcome,
          expectedSummaryIncludes: ["missing-summary-token"],
        },
      },
      rootDir,
      dataDir,
    });

    const store = new SqliteEvalStore(dataDir);
    const reviewItems = await store.listReviewItems({ triageStatus: "open" });
    const firstReviewItem = reviewItems[0];
    if (!firstReviewItem) {
      throw new Error("expected an open review item");
    }

    const summary = renderReviewQueueSummary({
      items: reviewItems,
      triageStatus: "open",
    });
    expect(summary).toContain("Open review items");
    expect(summary).toContain(firstReviewItem.reviewItemId);
    expect(summary).toContain("capability-happy-path-review-cli");

    const outputs: string[] = [];
    const exitCode = await executeEvalReviewCommand([
      "--data-dir",
      dataDir,
      "--close",
      firstReviewItem.reviewItemId,
      "--resolution",
      "scenario",
      "--follow-up-suite",
      "core-eval-suite",
      "--follow-up-scenario",
      "capability-happy-path-review-cli",
      "--follow-up-version",
      "1",
      "--note",
      "Queued a new scenario follow-up.",
    ], {
      stdout: {
        write(chunk) {
          outputs.push(chunk);
        },
      },
      stderr: {
        write(chunk) {
          outputs.push(chunk);
        },
      },
    });

    const closedItem = await store.getReviewItem(firstReviewItem.reviewItemId);
    expect(exitCode).toBe(0);
    expect(outputs.join("")).toContain("Closed review item");
    expect(closedItem?.triageStatus).toBe("closed");
    expect(closedItem?.resolutionType).toBe("scenario");
    expect(closedItem?.ownerNote).toContain("Queued a new scenario");
    expect(closedItem?.followUp).toEqual({
      kind: "scenario",
      suiteId: "core-eval-suite",
      scenarioId: "capability-happy-path-review-cli",
      scenarioVersion: 1,
    });

    const filteredOutputs: string[] = [];
    await executeEvalReviewCommand([
      "--data-dir",
      dataDir,
      "--status",
      "closed",
    ], {
      stdout: {
        write(chunk) {
          filteredOutputs.push(chunk);
        },
      },
      stderr: {
        write(chunk) {
          filteredOutputs.push(chunk);
        },
      },
    });

    expect(filteredOutputs.join("")).toContain(firstReviewItem.reviewItemId);
    expect(filteredOutputs.join("")).toContain("closed");

    await store.close();
    await removeWithRetry(rootDir, { recursive: true, force: true });
  });

  test("defaults review command data into an isolated internal eval directory", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-paths-"));
    const resolved = resolveEvalDataDir({ workspaceRoot });

    expect(resolved).toBe(path.join(workspaceRoot, ".openpx", "eval", "eval.sqlite"));

    await removeWithRetry(workspaceRoot, { recursive: true, force: true });
  });

  test("requires follow-up references for scenario, rule, and doc closures", () => {
    expect(() =>
      updateReviewQueueItemInputSchema.parse({
        reviewItemId: "review_1",
        triageStatus: "closed",
        resolutionType: "scenario",
        ownerNote: "Need a new scenario.",
        closedAt: "2026-04-09T00:00:00.000Z",
      })
    ).toThrow();

    expect(() =>
      updateReviewQueueItemInputSchema.parse({
        reviewItemId: "review_1",
        triageStatus: "closed",
        resolutionType: "accepted_noise",
        ownerNote: "Known flaky noise.",
        closedAt: "2026-04-09T00:00:00.000Z",
      })
    ).not.toThrow();
  });

  test("aggregates review queue closure and follow-up coverage metrics", () => {
    const items = [
      {
        reviewItemId: "review_open",
        scenarioRunId: "scenario_run_1",
        scenarioId: "scenario-a",
        sourceType: "outcome_check" as const,
        sourceId: "outcome.summary_contains",
        severity: "high" as const,
        triageStatus: "open" as const,
        resolutionType: undefined,
        summary: "summary mismatch",
        objectRefs: {
          threadId: "thread_1",
          runIds: ["run_1"],
          taskIds: ["task_1"],
          approvalIds: [],
        },
        ownerNote: undefined,
        followUp: undefined,
        createdAt: "2026-04-09T00:00:00.000Z",
        closedAt: undefined,
      },
      {
        reviewItemId: "review_closed_rule",
        scenarioRunId: "scenario_run_2",
        scenarioId: "scenario-b",
        sourceType: "trajectory_rule" as const,
        sourceId: "trajectory.resume_lineage_stability",
        severity: "medium" as const,
        triageStatus: "closed" as const,
        resolutionType: "rule" as const,
        summary: "lineage drift",
        objectRefs: {
          threadId: "thread_2",
          runIds: ["run_2"],
          taskIds: ["task_2"],
          approvalIds: [],
        },
        ownerNote: "Added rule coverage.",
        followUp: {
          kind: "rule" as const,
          ruleId: "trajectory.resume_lineage_stability",
          ruleKind: "trajectory_rule" as const,
        },
        createdAt: "2026-04-09T00:00:00.000Z",
        closedAt: "2026-04-09T00:01:00.000Z",
      },
      {
        reviewItemId: "review_closed_noise",
        scenarioRunId: "scenario_run_3",
        scenarioId: "scenario-c",
        sourceType: "trajectory_rule" as const,
        sourceId: "trajectory.repeated_blocked_recovery",
        severity: "low" as const,
        triageStatus: "closed" as const,
        resolutionType: "accepted_noise" as const,
        summary: "known noise",
        objectRefs: {
          threadId: "thread_3",
          runIds: ["run_3"],
          taskIds: ["task_3"],
          approvalIds: [],
        },
        ownerNote: "Accepted as noise.",
        followUp: undefined,
        createdAt: "2026-04-09T00:00:00.000Z",
        closedAt: "2026-04-09T00:01:00.000Z",
      },
      {
        reviewItemId: "review_closed_missing",
        scenarioRunId: "scenario_run_4",
        scenarioId: "scenario-d",
        sourceType: "outcome_check" as const,
        sourceId: "outcome.tool_call_count",
        severity: "high" as const,
        triageStatus: "closed" as const,
        resolutionType: "doc" as const,
        summary: "needs release note",
        objectRefs: {
          threadId: "thread_4",
          runIds: ["run_4"],
          taskIds: ["task_4"],
          approvalIds: [],
        },
        ownerNote: "Document the limitation.",
        followUp: undefined,
        createdAt: "2026-04-09T00:00:00.000Z",
        closedAt: "2026-04-09T00:01:00.000Z",
      },
    ];

    const summary = summarizeReviewQueue(items);
    const rendered = renderReviewQueueAggregateSummary(summary);

    expect(summary.total).toBe(4);
    expect(summary.byTriageStatus.open).toBe(1);
    expect(summary.byTriageStatus.closed).toBe(3);
    expect(summary.byResolutionType.rule).toBe(1);
    expect(summary.byResolutionType.accepted_noise).toBe(1);
    expect(summary.closedWithFollowUp).toBe(1);
    expect(summary.closedMissingFollowUp).toBe(1);
    expect(summary.acceptedNoiseCount).toBe(1);
    expect(rendered).toContain("Review queue aggregate");
    expect(rendered).toContain("follow-up coverage");
  });

  test("supports stats-only output for filtered review queue views", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-review-stats-"));
    const dataDir = path.join(rootDir, "openpx.db");
    const store = new SqliteEvalStore(dataDir);

    await store.saveReviewItem({
      reviewItemId: "review_stats_1",
      scenarioRunId: "scenario_run_1",
      scenarioId: "scenario-stats",
      sourceType: "trajectory_rule",
      sourceId: "trajectory.resume_lineage_stability",
      severity: "medium",
      triageStatus: "closed",
      resolutionType: "rule",
      summary: "stable rule follow-up",
      objectRefs: {
        threadId: "thread_1",
        runIds: ["run_1"],
        taskIds: ["task_1"],
        approvalIds: [],
      },
      ownerNote: "Added a rule.",
      followUp: {
        kind: "rule",
        ruleId: "trajectory.resume_lineage_stability",
        ruleKind: "trajectory_rule",
      },
      createdAt: "2026-04-09T00:00:00.000Z",
      closedAt: "2026-04-09T00:01:00.000Z",
    });

    await store.saveReviewItem({
      reviewItemId: "review_stats_2",
      scenarioRunId: "scenario_run_2",
      scenarioId: "scenario-stats",
      sourceType: "outcome_check",
      sourceId: "outcome.summary_contains",
      severity: "high",
      triageStatus: "open",
      resolutionType: undefined,
      summary: "still open",
      objectRefs: {
        threadId: "thread_2",
        runIds: ["run_2"],
        taskIds: ["task_2"],
        approvalIds: [],
      },
      ownerNote: undefined,
      followUp: undefined,
      createdAt: "2026-04-09T00:00:00.000Z",
      closedAt: undefined,
    });

    const outputs: string[] = [];
    const exitCode = await executeEvalReviewCommand([
      "--data-dir",
      dataDir,
      "--status",
      "closed",
      "--resolution-filter",
      "rule",
      "--stats-only",
    ], {
      stdout: { write(chunk) { outputs.push(chunk); } },
      stderr: { write(chunk) { outputs.push(chunk); } },
    });

    expect(exitCode).toBe(0);
    expect(outputs.join("")).toContain("Review queue aggregate");
    expect(outputs.join("")).toContain("triage: open=0 triaged=0 closed=1");
    expect(outputs.join("")).not.toContain("review_stats_1");

    await store.close();
    await removeWithRetry(rootDir, { recursive: true, force: true });
  });

  test("supports json output with aggregate and filtered review items", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-review-json-"));
    const dataDir = path.join(rootDir, "openpx.db");
    const store = new SqliteEvalStore(dataDir);

    await store.saveReviewItem({
      reviewItemId: "review_json_1",
      scenarioRunId: "scenario_run_json_1",
      scenarioId: "scenario-json",
      sourceType: "trajectory_rule",
      sourceId: "trajectory.resume_lineage_stability",
      severity: "medium",
      triageStatus: "closed",
      resolutionType: "rule",
      summary: "structured follow-up",
      objectRefs: {
        threadId: "thread_json_1",
        runIds: ["run_json_1"],
        taskIds: ["task_json_1"],
        approvalIds: [],
      },
      ownerNote: "Captured in a rule.",
      followUp: {
        kind: "rule",
        ruleId: "trajectory.resume_lineage_stability",
        ruleKind: "trajectory_rule",
      },
      createdAt: "2026-04-09T00:00:00.000Z",
      closedAt: "2026-04-09T00:01:00.000Z",
    });

    const outputs: string[] = [];
    const exitCode = await executeEvalReviewCommand([
      "--data-dir",
      dataDir,
      "--status",
      "closed",
      "--json",
    ], {
      stdout: { write(chunk) { outputs.push(chunk); } },
      stderr: { write(chunk) { outputs.push(chunk); } },
    });

    const payload = JSON.parse(outputs.join("")) as {
      filters: { triageStatus?: string };
      aggregate: { total: number; byResolutionType: { rule: number } };
      items: Array<{
        reviewItemId: string;
        followUp?: {
          kind: string;
          ruleId?: string;
          ruleKind?: string;
        };
      }>;
    };

    expect(exitCode).toBe(0);
    expect(payload.filters.triageStatus).toBe("closed");
    expect(payload.aggregate.total).toBe(1);
    expect(payload.aggregate.byResolutionType.rule).toBe(1);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.reviewItemId).toBe("review_json_1");
    expect(payload.items[0]?.followUp).toEqual({
      kind: "rule",
      ruleId: "trajectory.resume_lineage_stability",
      ruleKind: "trajectory_rule",
    });

    await store.close();
    await removeWithRetry(rootDir, { recursive: true, force: true });
  });

  test("preserves metadata when queue rows are updated through normal triage operations", async () => {
    const store = new SqliteEvalStore(":memory:");

    await store.saveReviewRecords([
      {
        item: {
          reviewItemId: "review_meta_1",
          scenarioRunId: "scenario_run_meta_1",
          scenarioId: "scenario-meta",
          sourceType: "trajectory_rule",
          sourceId: "trajectory.resume_lineage_stability",
          severity: "high",
          triageStatus: "open",
          resolutionType: undefined,
          summary: "real eval metadata should survive updates",
          objectRefs: {
            threadId: "thread_meta_1",
            runIds: ["run_meta_1"],
            taskIds: ["task_meta_1"],
            approvalIds: [],
          },
          ownerNote: undefined,
          followUp: undefined,
          createdAt: "2026-04-11T00:00:00.000Z",
          closedAt: undefined,
        },
        metadataJson: JSON.stringify({
          version: 1,
          lane: "real-eval",
          runId: "run_meta_1",
          failureClass: "graph_bypass_after_approval",
          impactedObject: "run:run_meta_1",
          nextSuggestedAction: "resume via run-loop",
          status: "failed",
        }),
      },
    ]);

    await store.saveReviewItem({
      reviewItemId: "review_meta_1",
      scenarioRunId: "scenario_run_meta_1",
      scenarioId: "scenario-meta",
      sourceType: "trajectory_rule",
      sourceId: "trajectory.resume_lineage_stability",
      severity: "medium",
      triageStatus: "triaged",
      resolutionType: undefined,
      summary: "updated summary",
      objectRefs: {
        threadId: "thread_meta_1",
        runIds: ["run_meta_1"],
        taskIds: ["task_meta_1"],
        approvalIds: [],
      },
      ownerNote: "triaged for follow-up",
      followUp: undefined,
      createdAt: "2026-04-11T00:00:00.000Z",
      closedAt: undefined,
    });

    await store.updateReviewItem({
      reviewItemId: "review_meta_1",
      triageStatus: "closed",
      resolutionType: "accepted_noise",
      ownerNote: "closed without erasing metadata",
      closedAt: "2026-04-11T00:01:00.000Z",
    });

    const [record] = await store.listReviewRecords({ scenarioId: "scenario-meta" });
    expect(record?.item.triageStatus).toBe("closed");
    expect(record?.metadataJson).toContain("\"lane\":\"real-eval\"");
    expect(record?.metadataJson).toContain("\"runId\":\"run_meta_1\"");

    await store.close();
  });
});
