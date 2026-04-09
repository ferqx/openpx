import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  createMissingBaselineDiff,
  compareScenarioToBaseline,
  loadEvalBaseline,
  renderEvalSummary,
  writeScenarioBaseline,
} from "./baseline";
import { resolveEvalDataDir } from "./eval-data-dir";
import { evalSuiteExecutionSummarySchema, type EvalScenario, type EvalSuiteExecutionSummary } from "./eval-schema";
import { summarizeReviewQueue } from "./review-queue";
import { runScenarioSuite } from "./scenario-runner";
import { CORE_EVAL_SUITE_ID, findEvalScenario, getEvalSuiteScenarios } from "./scenarios";
import { SqliteEvalStore } from "../persistence/sqlite/sqlite-eval-store";

type RunEvalSuiteOptions = {
  suiteId?: string;
  scenarios?: EvalScenario[];
  scenarioId?: string;
  rootDir?: string;
  dataDir?: string;
  baselineRootDir: string;
  updateBaseline?: boolean;
};

type EvalCommandIo = {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
};

type EvalSuiteCommandPayload = {
  summary: EvalSuiteExecutionSummary;
  suiteRun: {
    suiteRunId: string;
    suiteId: string;
    status: "running" | "completed" | "failed";
    startedAt: string;
    completedAt?: string;
  };
  scenarioResults: Awaited<ReturnType<SqliteEvalStore["listScenarioResultsBySuiteRun"]>>;
  reviewItems: Awaited<ReturnType<SqliteEvalStore["listReviewItems"]>>;
};

function deriveOverallStatus(input: {
  scenarioStatuses: Array<"passed" | "failed" | "suspicious">;
  baselineStatuses: Array<"matched" | "missing" | "regressed" | "updated">;
}): { status: EvalSuiteExecutionSummary["status"]; exitCode: number } {
  if (
    input.scenarioStatuses.some((status) => status === "failed")
    || input.baselineStatuses.some((status) => status === "regressed" || status === "missing")
  ) {
    return { status: "failed", exitCode: 1 };
  }

  if (input.scenarioStatuses.some((status) => status === "suspicious")) {
    return { status: "suspicious", exitCode: 0 };
  }

  return { status: "passed", exitCode: 0 };
}

function getDefaultRunRoot(): string {
  return path.join(os.tmpdir(), `openpx-eval-${Date.now()}`);
}

function resolveScenarios(input: { suiteId: string; scenarios?: EvalScenario[]; scenarioId?: string }): EvalScenario[] {
  const scenarios = input.scenarios ?? getEvalSuiteScenarios(input.suiteId);
  if (!input.scenarioId) {
    return scenarios;
  }

  const scenario = scenarios.find((item) => item.id === input.scenarioId) ?? findEvalScenario(input.suiteId, input.scenarioId);
  if (!scenario) {
    throw new Error(`Unknown eval scenario: ${input.scenarioId}`);
  }

  return [scenario];
}

export async function runEvalSuite(input: RunEvalSuiteOptions): Promise<EvalSuiteExecutionSummary> {
  const suiteId = input.suiteId ?? CORE_EVAL_SUITE_ID;
  const scenarios = resolveScenarios({ suiteId, scenarios: input.scenarios, scenarioId: input.scenarioId });
  const rootDir = input.rootDir ?? getDefaultRunRoot();
  const dataDir = resolveEvalDataDir({
    workspaceRoot: process.cwd(),
    explicitDataDir: input.dataDir,
  });
  await fs.mkdir(rootDir, { recursive: true });

  const suiteResult = await runScenarioSuite({
    suiteId,
    scenarios,
    rootDir,
    dataDir,
  });

  const store = new SqliteEvalStore(dataDir);
  try {
    const reviewItems = await store.listReviewItems();
    const scenarioRunIds = new Set(suiteResult.results.map((result) => result.scenarioRunId));
    const scopedReviewItems = reviewItems.filter((item) => scenarioRunIds.has(item.scenarioRunId));

    const scenarioSummaries = [];
    for (const result of suiteResult.results) {
      const reviewItemCount = scopedReviewItems.filter((item) => item.scenarioRunId === result.scenarioRunId).length;
      let baseline;
      if (input.updateBaseline) {
        await writeScenarioBaseline({
          baselineRootDir: input.baselineRootDir,
          suiteId,
          result,
        });
        baseline = {
          scenarioId: result.scenarioId,
          scenarioVersion: result.scenarioVersion,
          status: "updated" as const,
          differences: [],
        };
      } else {
        try {
          const loaded = await loadEvalBaseline({
            baselineRootDir: input.baselineRootDir,
            suiteId,
            scenarioId: result.scenarioId,
            scenarioVersion: result.scenarioVersion,
          });
          if (loaded.kind !== "scenario") {
            throw new Error(`Expected scenario baseline for ${result.scenarioId}`);
          }
          baseline = compareScenarioToBaseline({
            baseline: loaded.baseline,
            result,
          });
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            baseline = createMissingBaselineDiff({
              scenarioId: result.scenarioId,
              scenarioVersion: result.scenarioVersion,
            });
          } else {
            throw error;
          }
        }
      }

      scenarioSummaries.push({
        scenarioId: result.scenarioId,
        scenarioVersion: result.scenarioVersion,
        status: result.status,
        reviewItemCount,
        baseline,
      });
    }

    const overall = deriveOverallStatus({
      scenarioStatuses: scenarioSummaries.map((item) => item.status),
      baselineStatuses: scenarioSummaries.map((item) => item.baseline.status),
    });

    return evalSuiteExecutionSummarySchema.parse({
      suiteId,
      suiteRunId: suiteResult.suiteRunId,
      status: overall.status,
      exitCode: overall.exitCode,
      reviewQueueCount: scopedReviewItems.length,
      reviewQueueAggregate: summarizeReviewQueue(scopedReviewItems),
      scenarioSummaries,
    });
  } finally {
    await store.close();
  }
}

function printUsage(io: EvalCommandIo) {
  io.stderr.write(
    "Usage: bun run eval:suite [--suite <suiteId>] [--scenario <scenarioId>] [--update-baseline] [--root-dir <dir>] [--data-dir <path>] [--baseline-root-dir <dir>] [--json]\n",
  );
}

export async function executeEvalSuiteCommand(args: string[], io?: EvalCommandIo): Promise<number> {
  const resolvedIo: EvalCommandIo = io ?? {
    stdout: { write(chunk) { process.stdout.write(chunk); } },
    stderr: { write(chunk) { process.stderr.write(chunk); } },
  };

  let suiteId: string | undefined;
  let scenarioId: string | undefined;
  let rootDir: string | undefined;
  let dataDir: string | undefined;
  let baselineRootDir = path.join(process.cwd(), "eval-baselines");
  let updateBaseline = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--suite") {
      suiteId = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--scenario") {
      scenarioId = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--root-dir") {
      rootDir = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--data-dir") {
      dataDir = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--baseline-root-dir") {
      baselineRootDir = args[index + 1] ?? baselineRootDir;
      index += 1;
      continue;
    }
    if (arg === "--update-baseline") {
      updateBaseline = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--help") {
      printUsage(resolvedIo);
      return 0;
    }

    printUsage(resolvedIo);
    return 1;
  }

  const resolvedDataDir = resolveEvalDataDir({
    workspaceRoot: process.cwd(),
    explicitDataDir: dataDir,
  });

  const summary = await runEvalSuite({
    suiteId,
    scenarioId,
    rootDir,
    dataDir: resolvedDataDir,
    baselineRootDir,
    updateBaseline,
  });

  if (json) {
    const store = new SqliteEvalStore(resolvedDataDir);
    try {
      const suiteRun = await store.getSuiteRun(summary.suiteRunId);
      if (!suiteRun) {
        throw new Error(`Eval suite run not found: ${summary.suiteRunId}`);
      }
      const scenarioResults = await store.listScenarioResultsBySuiteRun(summary.suiteRunId);
      const scenarioRunIds = new Set(scenarioResults.map((result) => result.scenarioRunId));
      const reviewItems = (await store.listReviewItems())
        .filter((item) => scenarioRunIds.has(item.scenarioRunId));

      const payload: EvalSuiteCommandPayload = {
        summary,
        suiteRun,
        scenarioResults,
        reviewItems,
      };
      resolvedIo.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } finally {
      await store.close();
    }
    return summary.exitCode;
  }

  resolvedIo.stdout.write(renderEvalSummary(summary));
  return summary.exitCode;
}
