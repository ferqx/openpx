import fs from "node:fs/promises";
import path from "node:path";
import { renderReviewQueueAggregateSummary } from "./review-queue";
import {
  evalComparableRunSchema,
  evalScenarioBaselineSchema,
  evalScenarioBaselineDiffSchema,
  evalScenarioResultSchema,
  evalSuiteExecutionSummarySchema,
  type EvalComparableRun,
  type EvalResult,
  type EvalScenarioBaseline,
  type EvalScenarioBaselineDiff,
  type EvalScenarioResult,
  type EvalSuiteExecutionSummary,
} from "./eval-schema";

type LoadEvalBaselineOptions = {
  baselineRootDir: string;
  suiteId: string;
  scenarioId?: string;
  scenarioVersion?: number;
};

type LoadEvalBaselineResult =
  | { kind: "scenario"; baseline: EvalScenarioBaseline }
  | { kind: "suite"; baselines: EvalScenarioBaseline[] };

function getScenarioBaselinePath(input: {
  baselineRootDir: string;
  suiteId: string;
  scenarioId: string;
  scenarioVersion: number;
}): string {
  return path.join(
    input.baselineRootDir,
    input.suiteId,
    input.scenarioId,
    `v${input.scenarioVersion}.json`,
  );
}

function invertRecord(input: Record<string, string>): Record<string, string> {
  const inverted: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    inverted[value] = key;
  }
  return inverted;
}

function stableSort(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sanitizeComparable(comparable: EvalComparableRun): EvalComparableRun {
  return evalComparableRunSchema.parse({
    ...comparable,
    runtimeRefs: {
      threadId: "thread",
      runs: Object.fromEntries(Object.keys(comparable.runtimeRefs.runs).map((key) => [key, key])),
      tasks: Object.fromEntries(Object.keys(comparable.runtimeRefs.tasks).map((key) => [key, key])),
      approvals: Object.fromEntries(Object.keys(comparable.runtimeRefs.approvals).map((key) => [key, key])),
      toolCalls: Object.fromEntries(Object.keys(comparable.runtimeRefs.toolCalls).map((key) => [key, key])),
    },
  });
}

function sanitizeResults(results: EvalResult[], comparable: EvalComparableRun): EvalResult[] {
  const runAliases = invertRecord(comparable.runtimeRefs.runs);
  const taskAliases = invertRecord(comparable.runtimeRefs.tasks);
  const approvalAliases = invertRecord(comparable.runtimeRefs.approvals);

  return results.map((result) => ({
    ...result,
    objectRefs: {
      threadId: "thread",
      runIds: stableSort(result.objectRefs.runIds.map((runId) => runAliases[runId] ?? runId)),
      taskIds: stableSort(result.objectRefs.taskIds.map((taskId) => taskAliases[taskId] ?? taskId)),
      approvalIds: stableSort(result.objectRefs.approvalIds.map((approvalId) => approvalAliases[approvalId] ?? approvalId)),
    },
  }));
}

function toScenarioBaseline(input: { suiteId: string; result: EvalScenarioResult }): EvalScenarioBaseline {
  const parsed = evalScenarioResultSchema.parse(input.result);
  return evalScenarioBaselineSchema.parse({
    suiteId: input.suiteId,
    scenarioId: parsed.scenarioId,
    scenarioVersion: parsed.scenarioVersion,
    comparable: sanitizeComparable(parsed.comparable),
    outcomeResults: sanitizeResults(parsed.outcomeResults, parsed.comparable),
    trajectoryResults: sanitizeResults(parsed.trajectoryResults, parsed.comparable),
  });
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

async function listScenarioBaselineFiles(suiteRootDir: string): Promise<string[]> {
  const entries = await fs.readdir(suiteRootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(suiteRootDir, entry.name);
    if (entry.isDirectory()) {
      const versionEntries = await fs.readdir(entryPath, { withFileTypes: true });
      for (const versionEntry of versionEntries) {
        if (versionEntry.isFile() && versionEntry.name.endsWith(".json")) {
          files.push(path.join(entryPath, versionEntry.name));
        }
      }
    }
  }
  return stableSort(files);
}

export async function writeScenarioBaseline(input: {
  baselineRootDir: string;
  suiteId: string;
  result: EvalScenarioResult;
}): Promise<EvalScenarioBaseline> {
  const baseline = toScenarioBaseline(input);
  const filePath = getScenarioBaselinePath({
    baselineRootDir: input.baselineRootDir,
    suiteId: input.suiteId,
    scenarioId: baseline.scenarioId,
    scenarioVersion: baseline.scenarioVersion,
  });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  return baseline;
}

export async function loadEvalBaseline(input: LoadEvalBaselineOptions): Promise<LoadEvalBaselineResult> {
  if (input.scenarioId) {
    if (input.scenarioVersion === undefined) {
      throw new Error("scenarioVersion is required when loading a scenario baseline");
    }

    const filePath = getScenarioBaselinePath({
      baselineRootDir: input.baselineRootDir,
      suiteId: input.suiteId,
      scenarioId: input.scenarioId,
      scenarioVersion: input.scenarioVersion,
    });
    const raw = await fs.readFile(filePath, "utf8");
    return {
      kind: "scenario",
      baseline: evalScenarioBaselineSchema.parse(JSON.parse(raw)),
    };
  }

  const suiteRootDir = path.join(input.baselineRootDir, input.suiteId);
  const files = await listScenarioBaselineFiles(suiteRootDir);
  const baselines: EvalScenarioBaseline[] = [];
  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf8");
    baselines.push(evalScenarioBaselineSchema.parse(JSON.parse(raw)));
  }

  return { kind: "suite", baselines };
}

export function compareScenarioToBaseline(input: {
  baseline: EvalScenarioBaseline;
  result: EvalScenarioResult;
}): EvalScenarioBaselineDiff {
  const comparable = sanitizeComparable(input.result.comparable);
  const outcomeResults = sanitizeResults(input.result.outcomeResults, input.result.comparable);
  const trajectoryResults = sanitizeResults(input.result.trajectoryResults, input.result.comparable);
  const differences: EvalScenarioBaselineDiff["differences"] = [];

  if (stableSerialize(comparable) !== stableSerialize(input.baseline.comparable)) {
    differences.push({
      field: "comparable",
      message: "Comparable run diverged from baseline.",
    });
  }

  if (stableSerialize(outcomeResults) !== stableSerialize(input.baseline.outcomeResults)) {
    differences.push({
      field: "outcomeResults",
      message: "Outcome checks diverged from baseline.",
    });
  }

  if (stableSerialize(trajectoryResults) !== stableSerialize(input.baseline.trajectoryResults)) {
    differences.push({
      field: "trajectoryResults",
      message: "Trajectory rules diverged from baseline.",
    });
  }

  return evalScenarioBaselineDiffSchema.parse({
    scenarioId: input.result.scenarioId,
    scenarioVersion: input.result.scenarioVersion,
    status: differences.length > 0 ? "regressed" : "matched",
    differences,
  });
}

export function renderEvalSummary(summary: EvalSuiteExecutionSummary): string {
  const parsed = evalSuiteExecutionSummarySchema.parse(summary);
  const lines = [
    `Suite: ${parsed.suiteId}`,
    `Suite run: ${parsed.suiteRunId}`,
    `Status: ${parsed.status}`,
    `Review queue items: ${parsed.reviewQueueCount}`,
    renderReviewQueueAggregateSummary(parsed.reviewQueueAggregate).trimEnd(),
  ];

  for (const scenario of parsed.scenarioSummaries) {
    lines.push(
      `- ${scenario.scenarioId} v${scenario.scenarioVersion}: result=${scenario.status} baseline=${scenario.baseline.status} review=${scenario.reviewItemCount}`,
    );
    for (const difference of scenario.baseline.differences) {
      lines.push(`  ${difference.field}: ${difference.message}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function createMissingBaselineDiff(input: {
  scenarioId: string;
  scenarioVersion: number;
}): EvalScenarioBaselineDiff {
  return evalScenarioBaselineDiffSchema.parse({
    scenarioId: input.scenarioId,
    scenarioVersion: input.scenarioVersion,
    status: "missing",
    differences: [
      {
        field: "missing_baseline",
        message: "No baseline file was found for this scenario.",
      },
    ],
  });
}
