import { describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { coreEvalScenarios } from "../../src/eval/scenarios";
import { runScenario, runScenarioSuite } from "../../src/eval/scenario-runner";
import { SqliteEvalStore } from "../../src/persistence/sqlite/sqlite-eval-store";
import { removeWithRetry } from "../helpers/fs-cleanup";

function stripRuntimeRefs<T extends { runtimeRefs?: unknown }>(value: T): Omit<T, "runtimeRefs"> {
  const { runtimeRefs: _runtimeRefs, ...rest } = value;
  return rest;
}

describe("eval scenario runner", () => {
  test("runs the core scenarios and persists suite results", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-suite-"));
    const dataDir = path.join(rootDir, "openpx.db");

    const suiteResult = await runScenarioSuite({
      suiteId: "core-eval-suite",
      scenarios: coreEvalScenarios,
      rootDir,
      dataDir,
    });

    const store = new SqliteEvalStore(dataDir);
    const persisted = await store.listScenarioResultsBySuiteRun(suiteResult.suiteRunId);

    expect(suiteResult.results).toHaveLength(coreEvalScenarios.length);
    expect(suiteResult.results.every((result) => result.status === "passed")).toBe(true);
    expect(persisted).toHaveLength(coreEvalScenarios.length);
    expect(suiteResult.results.map((result) => result.scenarioId)).toEqual(
      expect.arrayContaining([
        "approval-approved-restart-idempotent",
        "rejection-no-executor-shortcut",
        "double-blocked-recovery",
        "restart-resume-lineage-stable",
      ]),
    );

    await store.close();
    await removeWithRetry(rootDir, { recursive: true, force: true });
  });

  test("produces stable comparable objects across repeated healthy runs", async () => {
    const scenario = coreEvalScenarios.find((item) => item.id === "approval-required-then-approved");
    if (!scenario) {
      throw new Error("approval-required-then-approved scenario not found");
    }

    const firstRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-stable-a-"));
    const secondRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-stable-b-"));

    const first = await runScenario({
      scenario,
      rootDir: firstRootDir,
      dataDir: path.join(firstRootDir, "openpx.db"),
    });
    const second = await runScenario({
      scenario,
      rootDir: secondRootDir,
      dataDir: path.join(secondRootDir, "openpx.db"),
    });

    expect(stripRuntimeRefs(first.comparable)).toEqual(stripRuntimeRefs(second.comparable));

    await removeWithRetry(firstRootDir, { recursive: true, force: true });
    await removeWithRetry(secondRootDir, { recursive: true, force: true });
  });

  test("enqueues review items when a scenario outcome is intentionally wrong", async () => {
    const baseScenario = coreEvalScenarios.find((item) => item.id === "capability-happy-path");
    if (!baseScenario) {
      throw new Error("capability-happy-path scenario not found");
    }

    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-review-"));
    const dataDir = path.join(rootDir, "openpx.db");

    const result = await runScenario({
      scenario: {
        ...baseScenario,
        id: "capability-happy-path-broken-expectation",
        expectedOutcome: {
          ...baseScenario.expectedOutcome,
          expectedSummaryIncludes: ["this summary does not exist"],
        },
      },
      rootDir,
      dataDir,
    });

    const store = new SqliteEvalStore(dataDir);
    const reviewItems = await store.listReviewItems();

    expect(result.status).toBe("failed");
    expect(reviewItems.length).toBeGreaterThan(0);
    expect(reviewItems[0]?.scenarioId).toBe("capability-happy-path-broken-expectation");

    await store.close();
    await removeWithRetry(rootDir, { recursive: true, force: true });
  });
});
