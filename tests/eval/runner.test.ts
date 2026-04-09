import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { coreEvalScenarios } from "../../src/eval/scenarios";
import { executeEvalSuiteCommand, runEvalSuite } from "../../src/eval/suite-runner";

describe("eval suite runner", () => {
  test("runs the core suite against repo baselines and returns a passing summary", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-suite-runner-"));
    const dataDir = path.join(rootDir, "openpx.db");
    const runtimeRootDir = path.join(rootDir, "runtime");
    const baselineRootDir = path.join(process.cwd(), "eval-baselines");

    const summary = await runEvalSuite({
      suiteId: "core-eval-suite",
      scenarios: coreEvalScenarios,
      dataDir,
      rootDir: runtimeRootDir,
      baselineRootDir,
    });

    expect(summary.status).toBe("passed");
    expect(summary.exitCode).toBe(0);
    expect(summary.scenarioSummaries).toHaveLength(coreEvalScenarios.length);
    expect(summary.scenarioSummaries.every((item) => item.baseline.status === "matched")).toBe(true);
    expect(summary.reviewQueueAggregate.total).toBe(0);
    expect(summary.reviewQueueAggregate.byTriageStatus.open).toBe(0);

    await fs.rm(rootDir, { recursive: true, force: true });
  });

  test("supports single-scenario execution while preserving the shared summary shape", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-suite-runner-one-"));
    const dataDir = path.join(rootDir, "openpx.db");
    const runtimeRootDir = path.join(rootDir, "runtime");

    const summary = await runEvalSuite({
      suiteId: "core-eval-suite",
      scenarios: coreEvalScenarios,
      scenarioId: "approval-required-then-approved",
      dataDir,
      rootDir: runtimeRootDir,
      baselineRootDir: path.join(process.cwd(), "eval-baselines"),
    });

    expect(summary.status).toBe("passed");
    expect(summary.scenarioSummaries).toHaveLength(1);
    expect(summary.scenarioSummaries[0]?.scenarioId).toBe("approval-required-then-approved");
    expect(summary.reviewQueueAggregate.total).toBe(0);

    await fs.rm(rootDir, { recursive: true, force: true });
  });

  test("updates baseline files when requested", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-suite-runner-update-"));
    const dataDir = path.join(rootDir, "openpx.db");
    const runtimeRootDir = path.join(rootDir, "runtime");
    const baselineRootDir = path.join(rootDir, "baselines");

    const summary = await runEvalSuite({
      suiteId: "core-eval-suite",
      scenarios: coreEvalScenarios,
      dataDir,
      rootDir: runtimeRootDir,
      baselineRootDir,
      updateBaseline: true,
    });

    const baselineFile = path.join(
      baselineRootDir,
      "core-eval-suite",
      "approval-required-then-approved",
      "v1.json",
    );

    expect(summary.status).toBe("passed");
    expect(await fs.stat(baselineFile)).toBeDefined();

    await fs.rm(rootDir, { recursive: true, force: true });
  });

  test("returns a failing gate when a stable regression diverges from baseline", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-suite-runner-fail-"));
    const dataDir = path.join(rootDir, "openpx.db");
    const runtimeRootDir = path.join(rootDir, "runtime");
    const baselineRootDir = path.join(rootDir, "baselines");

    await runEvalSuite({
      suiteId: "core-eval-suite",
      scenarios: coreEvalScenarios,
      dataDir,
      rootDir: runtimeRootDir,
      baselineRootDir,
      updateBaseline: true,
    });

    const baselineFile = path.join(
      baselineRootDir,
      "core-eval-suite",
      "capability-happy-path",
      "v1.json",
    );
    const baseline = JSON.parse(await fs.readFile(baselineFile, "utf8")) as {
      comparable: { terminalOutcome: { summary?: string } };
    };
    baseline.comparable.terminalOutcome.summary = "unexpected regression";
    await fs.writeFile(baselineFile, JSON.stringify(baseline, null, 2));

    const summary = await runEvalSuite({
      suiteId: "core-eval-suite",
      scenarios: coreEvalScenarios,
      dataDir: path.join(rootDir, "rerun.db"),
      rootDir: path.join(rootDir, "runtime-rerun"),
      baselineRootDir,
    });

    expect(summary.status).toBe("failed");
    expect(summary.exitCode).toBe(1);
    expect(summary.scenarioSummaries.some((item) => item.baseline.status === "regressed")).toBe(true);

    await fs.rm(rootDir, { recursive: true, force: true });
  });

  test("summarizes only the current suite run review items", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-suite-runner-review-"));
    const dataDir = path.join(rootDir, "openpx.db");
    const runtimeRootDir = path.join(rootDir, "runtime");

    const brokenScenario = {
      ...coreEvalScenarios[0]!,
      id: "capability-happy-path-suite-review",
      expectedOutcome: {
        ...coreEvalScenarios[0]!.expectedOutcome,
        expectedSummaryIncludes: ["missing-summary-token"],
      },
    };

    const summary = await runEvalSuite({
      suiteId: "core-eval-suite",
      scenarios: [brokenScenario],
      dataDir,
      rootDir: runtimeRootDir,
      baselineRootDir: path.join(process.cwd(), "eval-baselines"),
      updateBaseline: true,
    });

    expect(summary.reviewQueueCount).toBeGreaterThan(0);
    expect(summary.reviewQueueAggregate.total).toBe(summary.reviewQueueCount);
    expect(summary.reviewQueueAggregate.byTriageStatus.open).toBe(summary.reviewQueueCount);
    expect(summary.reviewQueueAggregate.byTriageStatus.closed).toBe(0);

    await fs.rm(rootDir, { recursive: true, force: true });
  });

  test("renders command output and exit code for the dev runner surface", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-suite-command-"));
    const outputs: string[] = [];

    const exitCode = await executeEvalSuiteCommand([
      "--suite",
      "core-eval-suite",
      "--scenario",
      "approval-required-then-approved",
      "--root-dir",
      path.join(rootDir, "runtime"),
      "--data-dir",
      path.join(rootDir, "openpx.db"),
      "--baseline-root-dir",
      path.join(process.cwd(), "eval-baselines"),
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

    expect(exitCode).toBe(0);
    expect(outputs.join("")).toContain("Suite: core-eval-suite");
    expect(outputs.join("")).toContain("Review queue aggregate");
    expect(outputs.join("")).toContain("approval-required-then-approved");

    await fs.rm(rootDir, { recursive: true, force: true });
  });

  test("supports json output with raw suite run artifacts", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpx-eval-suite-json-"));
    const outputs: string[] = [];

    const exitCode = await executeEvalSuiteCommand([
      "--suite",
      "core-eval-suite",
      "--scenario",
      "approval-required-then-approved",
      "--root-dir",
      path.join(rootDir, "runtime"),
      "--data-dir",
      path.join(rootDir, "openpx.db"),
      "--baseline-root-dir",
      path.join(process.cwd(), "eval-baselines"),
      "--json",
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

    const payload = JSON.parse(outputs.join("")) as {
      summary: {
        suiteId: string;
        scenarioSummaries: Array<{ scenarioId: string }>;
      };
      suiteRun: {
        suiteId: string;
      };
      scenarioResults: Array<{
        scenarioId: string;
        comparable: { terminalOutcome: { latestRunStatus?: string } };
      }>;
      reviewItems: unknown[];
    };

    expect(exitCode).toBe(0);
    expect(payload.summary.suiteId).toBe("core-eval-suite");
    expect(payload.summary.scenarioSummaries).toHaveLength(1);
    expect(payload.suiteRun.suiteId).toBe("core-eval-suite");
    expect(payload.scenarioResults).toHaveLength(1);
    expect(payload.scenarioResults[0]?.scenarioId).toBe("approval-required-then-approved");
    expect(payload.scenarioResults[0]?.comparable.terminalOutcome.latestRunStatus).toBe("completed");
    expect(payload.reviewItems).toEqual([]);

    await fs.rm(rootDir, { recursive: true, force: true });
  });
});
