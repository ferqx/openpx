import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prefixedUuid } from "../shared/id-generators";
import { SqliteEvalStore } from "../persistence/sqlite/sqlite-eval-store";
import type { ModelGateway } from "../infra/model-gateway";
import { evaluateRealTrace, type RealTraceEvaluation } from "./evaluation";
import { classifyRealEvalExecution } from "./evolution";
import { persistRealReviewQueueItems, type PersistedRealReviewQueueItem } from "./review-queue";
import { buildPromotionSummaries } from "./promotion";
import {
  RealSampleExecutionError,
  runRealSample,
  type RealSampleRun,
} from "./sample-runner";
import {
  type RealEvalEvolutionCandidate,
  type RealEvalFailureStage,
  type RealEvalScenarioResult,
  realEvalSuiteExecutionSummarySchema,
  parseRealEvalCommandArgs,
  type RealEvalScenarioId,
  type RealEvalSuiteId,
  type RealEvalScenario,
  type RealEvalSuiteExecutionSummary,
} from "./real-eval-schema";
import { findRealEvalPromptVariant, REAL_EVAL_SUITE_ID, getRealEvalSuiteScenarios } from "./scenarios";

/** real-eval CLI 的 IO 接口 */
type RealEvalCommandIo = {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
};

/** 运行 real-eval suite 的选项 */
type RunRealEvalSuiteOptions = {
  suiteId?: RealEvalSuiteId;
  scenarios?: readonly Readonly<RealEvalScenario>[];
  scenarioId?: RealEvalScenarioId;
  promptVariantId?: string;
  allVariants?: boolean;
  rootDir?: string;
  dataDir?: string;
  createModelGateway?: (workspaceRoot: string) => ModelGateway;
  runSample?: typeof runRealSample;
  evaluateTrace?: typeof evaluateRealTrace;
  persistReviewItems?: typeof persistRealReviewQueueItems;
};

/** execute 命令时可注入的依赖 */
type ExecuteRealEvalSuiteCommandDependencies = {
  runSuite?: typeof runRealEvalSuite;
};

/** 单场景执行结果 */
type RealEvalScenarioExecution = {
  summary: RealEvalScenarioResult;
  trace?: RealSampleRun["trace"];
  evaluation?: RealTraceEvaluation;
  evolutionCandidates: RealEvalEvolutionCandidate[];
};

/** 默认运行根目录 */
function getDefaultRunRoot(): string {
  return path.join(os.tmpdir(), `openpx-real-eval-${Date.now()}`);
}

/** 解析 real-eval 数据目录 */
function resolveRealEvalDataDir(explicitDataDir?: string): string {
  if (explicitDataDir) {
    return explicitDataDir;
  }

  const envDataDir = process.env.OPENPX_REAL_EVAL_DATA_DIR;
  if (envDataDir && envDataDir.length > 0) {
    return envDataDir;
  }

  return path.join(process.cwd(), ".openpx", "real-eval", "real-eval.sqlite");
}

/** 解析要执行的 real-eval 场景集合 */
function resolveScenarios(input: {
  suiteId: RealEvalSuiteId;
  scenarios?: readonly Readonly<RealEvalScenario>[];
  scenarioId?: RealEvalScenarioId;
}): RealEvalScenario[] {
  const scenarios = input.scenarios ?? getRealEvalSuiteScenarios(input.suiteId);
  if (!input.scenarioId) {
    return [...scenarios];
  }

  const scenario = scenarios.find((item) => item.id === input.scenarioId);
  if (!scenario) {
    throw new Error(`Unknown real eval scenario in provided suite subset: ${input.scenarioId}`);
  }

  return [scenario];
}

function deriveScenarioStatus(sampleStatus: RealSampleRun["status"], evaluationStatus: RealTraceEvaluation["status"]): "passed" | "failed" | "suspicious" {
  if (sampleStatus === "completed") {
    return evaluationStatus;
  }

  if (sampleStatus === "suspicious") {
    return "suspicious";
  }

  return "failed";
}

function deriveSuiteStatus(statuses: Array<"passed" | "failed" | "suspicious">): { status: RealEvalSuiteExecutionSummary["status"]; exitCode: number } {
  if (statuses.some((status) => status === "failed")) {
    return { status: "failed", exitCode: 1 };
  }

  if (statuses.some((status) => status === "suspicious")) {
    return { status: "suspicious", exitCode: 0 };
  }

  return { status: "passed", exitCode: 0 };
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function resolveScenarioArtifactPaths(scenarioRootDir: string, sample?: Pick<RealSampleRun, "artifactsDir" | "tracePath">): {
  artifactsDir?: string;
  tracePath?: string;
} {
  if (sample) {
    return {
      artifactsDir: sample.artifactsDir,
      tracePath: sample.tracePath,
    };
  }

  const artifactsDir = path.join(scenarioRootDir, "artifacts");
  const tracePath = path.join(artifactsDir, "trace.json");
  return {
    artifactsDir,
    tracePath: undefined,
  };
}

function createScenarioSummary(input: {
  scenario: Readonly<RealEvalScenario>;
  status: RealEvalScenarioResult["status"];
  promptVariantId?: string;
  failureStage?: RealEvalFailureStage;
  message?: string;
  failureClass?: RealEvalScenarioResult["failureClass"];
  evolutionTarget?: RealEvalScenarioResult["evolutionTarget"];
  artifactsDir?: string;
  tracePath?: string;
}): RealEvalScenarioResult {
  return {
    scenarioId: input.scenario.id,
    scenarioVersion: input.scenario.version,
    family: input.scenario.family,
    capabilityFamily: input.scenario.capabilityFamily,
    status: input.status,
    promptVariantId: input.promptVariantId,
    failureStage: input.failureStage,
    message: input.message,
    failureClass: input.failureClass,
    evolutionTarget: input.evolutionTarget,
    artifactsDir: input.artifactsDir,
    tracePath: input.tracePath,
  };
}

async function executeScenario(input: {
  scenario: Readonly<RealEvalScenario>;
  promptVariantId?: string;
  scenarioRootDir: string;
  dataDir: string;
  store: SqliteEvalStore;
  scenarioRunId: string;
  createModelGateway?: (workspaceRoot: string) => ModelGateway;
  runSampleImpl: typeof runRealSample;
  evaluateTraceImpl: typeof evaluateRealTrace;
  persistReviewItemsImpl: typeof persistRealReviewQueueItems;
}): Promise<RealEvalScenarioExecution> {
  let sample: RealSampleRun | undefined;

  try {
    sample = await input.runSampleImpl({
      scenario: input.scenario,
      promptVariantId: input.promptVariantId,
      rootDir: input.scenarioRootDir,
      dataDir: input.dataDir,
      createModelGateway: input.createModelGateway,
    });
  } catch (error) {
    const paths = resolveScenarioArtifactPaths(input.scenarioRootDir);
    const summary = createScenarioSummary({
      scenario: input.scenario,
      status: "failed",
      promptVariantId: input.promptVariantId,
      failureStage: "sample_execution",
      message: normalizeErrorMessage(error, "Unknown sample execution failure"),
      artifactsDir: paths.artifactsDir,
      tracePath: paths.tracePath,
    });
    const evolutionCandidates = classifyRealEvalExecution({
      scenario: input.scenario,
      scenarioResult: summary,
      plannerEvidence: error instanceof RealSampleExecutionError ? error.evidence.plannerEvidence : undefined,
      approvalPathEvidence: error instanceof RealSampleExecutionError ? error.evidence.approvalPathEvidence : undefined,
    });
    const primaryCandidate = evolutionCandidates[0];
    return {
      summary: {
        ...summary,
        failureClass: primaryCandidate?.failureClass,
        evolutionTarget: primaryCandidate?.evolutionTarget,
      },
      evolutionCandidates,
    };
  }

  let evaluation: RealTraceEvaluation;
  try {
    evaluation = input.evaluateTraceImpl(sample.trace);
  } catch (error) {
    const paths = resolveScenarioArtifactPaths(input.scenarioRootDir, sample);
    const summary = createScenarioSummary({
      scenario: input.scenario,
      status: "failed",
      promptVariantId: sample.promptVariantId,
      failureStage: "evaluation",
      message: normalizeErrorMessage(error, "Unknown evaluation failure"),
      artifactsDir: paths.artifactsDir,
      tracePath: paths.tracePath,
    });
    const evolutionCandidates = classifyRealEvalExecution({
      scenario: input.scenario,
      scenarioResult: summary,
      trace: sample.trace,
    });
    const primaryCandidate = evolutionCandidates[0];
    return {
      summary: {
        ...summary,
        failureClass: primaryCandidate?.failureClass,
        evolutionTarget: primaryCandidate?.evolutionTarget,
      },
      trace: sample.trace,
      evolutionCandidates,
    };
  }

  const paths = resolveScenarioArtifactPaths(input.scenarioRootDir, sample);
  const baseSummary = createScenarioSummary({
    scenario: input.scenario,
    status: deriveScenarioStatus(sample.status, evaluation.status),
    promptVariantId: sample.promptVariantId,
    artifactsDir: paths.artifactsDir,
    tracePath: paths.tracePath,
  });
  const evolutionCandidates = classifyRealEvalExecution({
    scenario: input.scenario,
    scenarioResult: baseSummary,
    trace: sample.trace,
    evaluation,
  });

  try {
    await input.persistReviewItemsImpl({
      store: input.store,
      scenarioRunId: input.scenarioRunId,
      trace: sample.trace,
      evaluation,
      evolutionCandidates,
    });
  } catch (error) {
    const summary = createScenarioSummary({
      scenario: input.scenario,
      status: "failed",
      promptVariantId: sample.promptVariantId,
      failureStage: "review_queue_persist",
      message: normalizeErrorMessage(error, "Unknown review queue persistence failure"),
      artifactsDir: paths.artifactsDir,
      tracePath: paths.tracePath,
    });
    const failedEvolutionCandidates = classifyRealEvalExecution({
      scenario: input.scenario,
      scenarioResult: summary,
      trace: sample.trace,
      evaluation,
    });
    const primaryCandidate = failedEvolutionCandidates[0];
    return {
      summary: {
        ...summary,
        failureClass: primaryCandidate?.failureClass,
        evolutionTarget: primaryCandidate?.evolutionTarget,
      },
      trace: sample.trace,
      evaluation,
      evolutionCandidates: failedEvolutionCandidates.length > 0
        ? failedEvolutionCandidates
        : evolutionCandidates,
    };
  }

  const primaryCandidate = evolutionCandidates[0];
  return {
    summary: {
      ...baseSummary,
      failureClass: primaryCandidate?.failureClass,
      evolutionTarget: primaryCandidate?.evolutionTarget,
    },
    trace: sample.trace,
    evaluation,
    evolutionCandidates,
  };
}

function renderRealEvalSummary(summary: RealEvalSuiteExecutionSummary): string {
  const lines = [
    "Real eval lane",
    `Suite: ${summary.suiteId}`,
    `Suite run: ${summary.suiteRunId}`,
    `Status: ${summary.status}`,
    `Scenarios: ${summary.scenarioSummaries.length}`,
  ];

  for (const scenario of summary.scenarioSummaries) {
    lines.push(`- ${scenario.scenarioId} [${scenario.status}]`);
    if (scenario.promptVariantId) {
      lines.push(`  variant: ${scenario.promptVariantId}`);
    }
    if (scenario.failureStage) {
      lines.push(`  stage: ${scenario.failureStage}`);
    }
    if (scenario.message) {
      lines.push(`  reason: ${scenario.message}`);
    }
    if (scenario.failureClass) {
      lines.push(`  failure class: ${scenario.failureClass}`);
    }
    if (scenario.evolutionTarget) {
      lines.push(`  evolution target: ${scenario.evolutionTarget}`);
    }
    if (scenario.artifactsDir) {
      lines.push(`  artifacts: ${scenario.artifactsDir}`);
    }
    if (scenario.tracePath) {
      lines.push(`  trace: ${scenario.tracePath}`);
    }
  }

  if (summary.promotionSummaries.length > 0) {
    lines.push(`Promotions: ${summary.promotionSummaries.length}`);
    for (const promotion of summary.promotionSummaries) {
      lines.push(`- ${promotion.capabilityFamily} [${promotion.promotionStatus}]`);
      lines.push(
        `  evidence: live=${promotion.promotionEvidence.liveRealEvalPassed} deterministic=${promotion.promotionEvidence.deterministicRegressionPresent} runtime=${promotion.promotionEvidence.runtimeRegressionPresent}`,
      );
      if (promotion.mappedGuardrails.length > 0) {
        lines.push(`  guardrails: ${promotion.mappedGuardrails.map((guardrail) => guardrail.guardrailId).join(", ")}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function runRealEvalSuite(input: RunRealEvalSuiteOptions): Promise<RealEvalSuiteExecutionSummary> {
  const suiteId = input.suiteId ?? REAL_EVAL_SUITE_ID;
  if (suiteId !== REAL_EVAL_SUITE_ID) {
    throw new Error(`Unsupported real eval suite: ${suiteId}`);
  }

  const scenarios = resolveScenarios({ suiteId, scenarios: input.scenarios, scenarioId: input.scenarioId });
  const rootDir = input.rootDir ?? getDefaultRunRoot();
  const dataDir = resolveRealEvalDataDir(input.dataDir);
  await fs.mkdir(rootDir, { recursive: true });
  await fs.mkdir(path.dirname(dataDir), { recursive: true });
  const runSampleImpl = input.runSample ?? runRealSample;
  const evaluateTraceImpl = input.evaluateTrace ?? evaluateRealTrace;
  const persistReviewItemsImpl = input.persistReviewItems ?? persistRealReviewQueueItems;

  const store = new SqliteEvalStore(dataDir);
  const scenarioSummaries: RealEvalScenarioResult[] = [];
  const evolutionCandidates: RealEvalEvolutionCandidate[] = [];

  try {
    for (const scenario of scenarios) {
      const promptVariants = input.allVariants
        ? scenario.promptVariants
        : [findRealEvalPromptVariant(scenario, input.promptVariantId)].filter(
            (variant): variant is NonNullable<ReturnType<typeof findRealEvalPromptVariant>> => Boolean(variant),
          );
      if (promptVariants.length === 0) {
        throw new Error(`Unknown prompt variant in scenario ${scenario.id}: ${input.promptVariantId}`);
      }

      for (const promptVariant of promptVariants) {
        const scenarioRootDir = input.allVariants
          ? path.join(rootDir, scenario.id, promptVariant.id)
          : path.join(rootDir, scenario.id);
        const scenarioRunId = prefixedUuid("scenario_run");
        const scenarioExecution = await executeScenario({
          scenario,
          promptVariantId: promptVariant.id,
          scenarioRootDir,
          dataDir,
          store,
          scenarioRunId,
          createModelGateway: input.createModelGateway,
          runSampleImpl,
          evaluateTraceImpl,
          persistReviewItemsImpl,
        });
        scenarioSummaries.push(scenarioExecution.summary);
        evolutionCandidates.push(...scenarioExecution.evolutionCandidates);
      }
    }
  } finally {
    await store.close();
  }

  const overall = deriveSuiteStatus(scenarioSummaries.map((item) => item.status));
  const promotionSummaries = buildPromotionSummaries({ scenarioSummaries });
  return realEvalSuiteExecutionSummarySchema.parse({
    lane: "real-eval",
    suiteId,
    suiteRunId: prefixedUuid("real_eval_suite_run"),
    status: overall.status,
    exitCode: overall.exitCode,
    scenarioSummaries,
    evolutionCandidates,
    promotionSummaries,
  });
}

function printUsage(io: RealEvalCommandIo): void {
  io.stderr.write("Usage: bun run eval:real [--suite <suiteId>] [--scenario <scenarioId>] [--variant <variantId>] [--all-variants] [--root-dir <dir>] [--data-dir <path>] [--json]\n");
}

export async function executeRealEvalSuiteCommand(
  args: string[],
  io?: RealEvalCommandIo,
  dependencies?: ExecuteRealEvalSuiteCommandDependencies,
): Promise<number> {
  const resolvedIo: RealEvalCommandIo = io ?? {
    stdout: { write(chunk) { process.stdout.write(chunk); } },
    stderr: { write(chunk) { process.stderr.write(chunk); } },
  };
  const runSuite = dependencies?.runSuite ?? runRealEvalSuite;

  if (args.includes("--help")) {
    printUsage(resolvedIo);
    return 0;
  }

  let options;
  try {
    options = parseRealEvalCommandArgs(args);
  } catch (error) {
    printUsage(resolvedIo);
    if (error instanceof Error) {
      resolvedIo.stderr.write(`${error.message}\n`);
    }
    return 1;
  }

  const summary = await runSuite({
    suiteId: options.suiteId ?? REAL_EVAL_SUITE_ID,
    scenarioId: options.scenarioId,
    promptVariantId: options.promptVariantId,
    allVariants: options.allVariants,
    rootDir: options.rootDir,
    dataDir: options.dataDir,
  });

  if (options.json) {
    resolvedIo.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return summary.exitCode;
  }

  resolvedIo.stdout.write(renderRealEvalSummary(summary));
  return summary.exitCode;
}
