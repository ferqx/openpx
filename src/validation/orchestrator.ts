import fs from "node:fs/promises";
import path from "node:path";
import { prefixedUuid } from "../shared/id-generators";
import { findEvalScenario } from "../eval/scenarios";
import { runScenario } from "../eval/scenario-runner";
import type { EvalScenarioResult } from "../eval/eval-schema";
import { SqliteEvalStore } from "../persistence/sqlite/sqlite-eval-store";
import { findRealEvalScenario } from "../harness/eval/real/scenarios";
import { runRealSample } from "../harness/eval/real/sample-runner";
import { evaluateRealTrace } from "../harness/eval/real/evaluation";
import type { RealTraceEvaluation } from "../harness/eval/real/evaluation";
import type { RealRunTrace, RealEvalScenarioResult } from "../harness/eval/real/real-eval-schema";
import {
  renderValidationEngineeringView,
  renderValidationProductGateView,
  renderValidationScenarioEngineeringView,
  renderValidationScenarioProductGateView,
} from "./reporting";
import { persistValidationReviewRecords } from "./review-queue";
import {
  validationEvidenceBundleSchema,
  validationScenarioSpecSchema,
  validationSuiteSummarySchema,
  validationVerdictSchema,
  type ValidationAcceptanceCheck,
  type ValidationApprovalEvent,
  type ValidationArtifactPaths,
  type ValidationCapabilityScore,
  type ValidationRepairRecommendation,
  type ValidationRunStatus,
  type ValidationScenarioSpec,
  type ValidationScenarioVerdictRecord,
  type ValidationSuiteSummary,
  type ValidationTaskFamily,
} from "./validation-schema";

/** deterministic 验证执行器接口 */
type DeterministicExecutor = (input: {
  spec: ValidationScenarioSpec;
  sandboxRoot: string;
  sandboxRepoRoot: string;
  dataDir: string;
}) => Promise<EvalScenarioResult>;

/** real-eval 验证执行器接口 */
type RealExecutor = (input: {
  spec: ValidationScenarioSpec;
  sandboxRoot: string;
  sandboxRepoRoot: string;
  dataDir: string;
}) => Promise<{
  summary: RealEvalScenarioResult;
  trace?: RealRunTrace;
  evaluationStatus: RealTraceEvaluation["status"];
}>;

/** 运行 validation suite 所需选项 */
type RunValidationSuiteOptions = {
  scenarios: ValidationScenarioSpec[];
  rootDir: string;
  dataDir: string;
  familyThresholds?: Partial<Record<ValidationTaskFamily, number>>;
  executeDeterministicScenario?: DeterministicExecutor;
  executeRealScenario?: RealExecutor;
};

const DEFAULT_FAMILY_THRESHOLD = 0.7;

/** 把 passed/suspicious/failed 映射为数值分 */
function scoreFromStatus(status: ValidationRunStatus): number {
  if (status === "passed") {
    return 1;
  }
  if (status === "suspicious") {
    return 0.6;
  }
  return 0.3;
}

/** 聚合多个维度状态 */
function combineStatuses(statuses: ValidationRunStatus[]): ValidationRunStatus {
  if (statuses.includes("failed")) {
    return "failed";
  }
  if (statuses.includes("suspicious")) {
    return "suspicious";
  }
  return "passed";
}

async function writeJsonFile(targetPath: string, value: unknown): Promise<void> {
  await Bun.write(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextFile(targetPath: string, value: string): Promise<void> {
  await Bun.write(targetPath, value);
}

async function provisionSandbox(spec: ValidationScenarioSpec, suiteRunRoot: string): Promise<{
  sandboxRoot: string;
  sandboxRepoRoot: string;
}> {
  const sandboxRoot = path.join(suiteRunRoot, spec.id);
  const sandboxRepoRoot = path.join(sandboxRoot, "repo");
  await fs.mkdir(sandboxRoot, { recursive: true });
  await fs.cp(spec.repoSource.localPath, sandboxRepoRoot, { recursive: true });
  return { sandboxRoot, sandboxRepoRoot };
}

async function runAcceptanceChecks(checks: ValidationAcceptanceCheck[], sandboxRepoRoot: string): Promise<ValidationRunStatus> {
  for (const check of checks) {
    const targetPath = path.join(sandboxRepoRoot, check.path);
    const exists = await Bun.file(targetPath).exists();
    if (check.kind === "file_exists" && !exists) {
      return "failed";
    }
    if (check.kind === "file_missing" && exists) {
      return "failed";
    }
  }
  return "passed";
}

function buildDeterministicApprovalEvents(result: EvalScenarioResult): ValidationApprovalEvent[] {
  const events: ValidationApprovalEvent[] = result.comparable.approvalFlow.requested.map((approval) => ({
    approvalRequestId: result.comparable.runtimeRefs.approvals[approval.alias] ?? approval.alias,
    status: "requested",
    summary: approval.summary,
    source: "backend_comparable",
  }));
  const resolution = result.comparable.approvalFlow.resolution;
  if ((resolution === "approved" || resolution === "rejected") && events[0]) {
    events.push({
      approvalRequestId: events[0].approvalRequestId,
      status: resolution,
      summary: result.comparable.approvalFlow.rejectionReason ?? result.comparable.terminalOutcome.summary ?? resolution,
      source: "backend_comparable",
    });
  }
  return events;
}

function buildRealApprovalEvents(trace?: RealRunTrace): ValidationApprovalEvent[] {
  if (!trace) {
    return [];
  }
  return trace.milestones.flatMap<ValidationApprovalEvent>((milestone) => {
    if (milestone.kind === "approval_requested" && milestone.approvalRequestId) {
      return [{
        approvalRequestId: milestone.approvalRequestId,
        status: "requested",
        summary: milestone.summary ?? "approval requested",
        source: "backend_trace",
      }];
    }
    if (milestone.kind === "approval_resolved" && milestone.approvalRequestId && milestone.resolution) {
      return [{
        approvalRequestId: milestone.approvalRequestId,
        status: milestone.resolution,
        summary: milestone.summary ?? milestone.resolution,
        source: "backend_trace",
      }];
    }
    return [];
  });
}

function inferFailureClass(input: {
  primaryFamily: ValidationTaskFamily;
  controlStatus: ValidationRunStatus;
}): ValidationRepairRecommendation["failureClass"] {
  if (input.controlStatus !== "passed") {
    return "approval_control_failure";
  }
  if (input.primaryFamily === "recovery_consistency") {
    return "recovery_consistency_failure";
  }
  if (input.primaryFamily === "approval_control") {
    return "executor_handoff_failure";
  }
  return "eval_harness_gap";
}

function inferRootCauseLayer(primaryFamily: ValidationTaskFamily): ValidationRepairRecommendation["rootCauseLayer"] {
  if (primaryFamily === "approval_control") {
    return "approval_runtime";
  }
  if (primaryFamily === "recovery_consistency") {
    return "recovery_runtime";
  }
  return "eval_harness";
}

function buildRepairRecommendations(input: {
  validationRunId: string;
  spec: ValidationScenarioSpec;
  evidencePath: string;
  verdictStatus: ValidationRunStatus;
  dimensions: {
    control: ValidationRunStatus;
  };
}): ValidationRepairRecommendation[] {
  if (input.verdictStatus === "passed") {
    return [];
  }
  return [{
    recommendationId: prefixedUuid("repair"),
    validationRunId: input.validationRunId,
    scenarioId: input.spec.id,
    failureClass: inferFailureClass({
      primaryFamily: input.spec.taskFamily.primary,
      controlStatus: input.dimensions.control,
    }),
    rootCauseLayer: inferRootCauseLayer(input.spec.taskFamily.primary),
    impactedObject: `scenario:${input.spec.id}`,
    severity: input.verdictStatus === "failed" ? "high" : "medium",
    confidence: input.verdictStatus === "failed" ? 0.9 : 0.7,
    repairPath: `Inspect ${input.spec.taskFamily.primary} behavior and restore the expected validation contract.`,
    evidenceRefs: [`evidence:${input.evidencePath}`],
  }];
}

function buildCapabilityScores(input: {
  spec: ValidationScenarioSpec;
  aggregateScore: number;
  familyThresholds: Partial<Record<ValidationTaskFamily, number>>;
}): ValidationCapabilityScore[] {
  const families = [input.spec.taskFamily.primary, ...input.spec.taskFamily.secondary];
  return families.map((family) => {
    const threshold = input.familyThresholds[family] ?? DEFAULT_FAMILY_THRESHOLD;
    return {
      family,
      score: input.aggregateScore,
      threshold,
      blocking: input.aggregateScore < threshold,
    };
  });
}

async function defaultDeterministicExecutor(input: {
  spec: ValidationScenarioSpec;
  sandboxRoot: string;
  sandboxRepoRoot: string;
  dataDir: string;
}): Promise<EvalScenarioResult> {
  if (input.spec.backend.kind !== "deterministic_eval") {
    throw new Error("Expected deterministic_eval backend.");
  }
  const scenario = findEvalScenario(input.spec.backend.suiteId, input.spec.backend.scenarioId);
  if (!scenario) {
    throw new Error(`Unknown deterministic eval scenario: ${input.spec.backend.scenarioId}`);
  }
  return runScenario({
    scenario,
    rootDir: path.join(input.sandboxRoot, "deterministic"),
    dataDir: input.dataDir,
  });
}

async function defaultRealExecutor(input: {
  spec: ValidationScenarioSpec;
  sandboxRoot: string;
  sandboxRepoRoot: string;
  dataDir: string;
}): Promise<{
  summary: RealEvalScenarioResult;
  trace?: RealRunTrace;
  evaluationStatus: RealTraceEvaluation["status"];
}> {
  if (input.spec.backend.kind !== "real_eval") {
    throw new Error("Expected real_eval backend.");
  }
  const scenarioId = input.spec.backend.scenarioId as Parameters<typeof findRealEvalScenario>[0];
  const scenario = findRealEvalScenario(scenarioId);
  if (!scenario) {
    throw new Error(`Unknown real eval scenario: ${input.spec.backend.scenarioId}`);
  }
  const sample = await runRealSample({
    scenario,
    promptVariantId: input.spec.backend.promptVariantId,
    rootDir: path.join(input.sandboxRoot, "real"),
    dataDir: input.dataDir,
  });
  const evaluation = evaluateRealTrace(sample.trace);
  return {
    summary: {
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      family: scenario.family,
      capabilityFamily: scenario.capabilityFamily,
      status: evaluation.status,
      promptVariantId: sample.promptVariantId,
      artifactsDir: sample.artifactsDir,
      tracePath: sample.tracePath,
    },
    trace: sample.trace,
    evaluationStatus: evaluation.status,
  };
}

async function persistScenarioArtifacts(record: ValidationScenarioVerdictRecord): Promise<ValidationScenarioVerdictRecord> {
  const artifactDir = record.evidence.sandboxRoot;
  const artifactPaths: ValidationArtifactPaths = {
    artifactDir,
    evidenceJsonPath: path.join(artifactDir, "evidence.json"),
    verdictJsonPath: path.join(artifactDir, "verdict.json"),
    engineeringReportPath: path.join(artifactDir, "engineering.txt"),
    productGateReportPath: path.join(artifactDir, "product-gate.txt"),
  };
  const updatedRecord: ValidationScenarioVerdictRecord = {
    ...record,
    evidence: {
      ...record.evidence,
      artifactPaths,
    },
  };
  await writeJsonFile(artifactPaths.evidenceJsonPath ?? path.join(artifactDir, "evidence.json"), updatedRecord.evidence);
  await writeJsonFile(artifactPaths.verdictJsonPath ?? path.join(artifactDir, "verdict.json"), updatedRecord.verdict);
  await writeTextFile(
    artifactPaths.engineeringReportPath ?? path.join(artifactDir, "engineering.txt"),
    renderValidationScenarioEngineeringView(updatedRecord),
  );
  await writeTextFile(
    artifactPaths.productGateReportPath ?? path.join(artifactDir, "product-gate.txt"),
    renderValidationScenarioProductGateView(updatedRecord),
  );
  return updatedRecord;
}

async function executeScenario(
  spec: ValidationScenarioSpec,
  validationSuiteRunId: string,
  suiteRunRoot: string,
  dataDir: string,
  familyThresholds: Partial<Record<ValidationTaskFamily, number>>,
  deterministicExecutor: DeterministicExecutor,
  realExecutor: RealExecutor,
): Promise<ValidationScenarioVerdictRecord> {
  const parsedSpec = validationScenarioSpecSchema.parse(spec);
  const validationRunId = prefixedUuid("validation_run");
  const { sandboxRoot, sandboxRepoRoot } = await provisionSandbox(parsedSpec, suiteRunRoot);

  let outcomeStatus: ValidationRunStatus;
  let trajectoryStatus: ValidationRunStatus;
  let controlStatus: ValidationRunStatus;
  let approvalEvents: ValidationApprovalEvent[];
  let backendRefs;

  if (parsedSpec.backend.kind === "deterministic_eval") {
    const result = await deterministicExecutor({
      spec: parsedSpec,
      sandboxRoot,
      sandboxRepoRoot,
      dataDir,
    });
    const acceptanceStatus = await runAcceptanceChecks(parsedSpec.acceptanceChecks, sandboxRepoRoot);
    outcomeStatus = combineStatuses([result.status, acceptanceStatus]);
    trajectoryStatus = result.status;
    controlStatus = parsedSpec.sandboxPolicy.permissionMode === "guarded"
      ? (result.comparable.approvalFlow.requested.length > 0 ? "passed" : "failed")
      : "passed";
    approvalEvents = buildDeterministicApprovalEvents(result);
    backendRefs = {
      kind: "deterministic_eval" as const,
      suiteId: parsedSpec.backend.suiteId,
      scenarioRunId: result.scenarioRunId,
    };
  } else {
    const result = await realExecutor({
      spec: parsedSpec,
      sandboxRoot,
      sandboxRepoRoot,
      dataDir,
    });
    const acceptanceStatus = await runAcceptanceChecks(parsedSpec.acceptanceChecks, sandboxRepoRoot);
    outcomeStatus = combineStatuses([result.summary.status, result.evaluationStatus, acceptanceStatus]);
    trajectoryStatus = result.evaluationStatus;
    controlStatus = parsedSpec.sandboxPolicy.permissionMode === "guarded"
      ? (result.trace && buildRealApprovalEvents(result.trace).length > 0 ? "passed" : "failed")
      : "passed";
    approvalEvents = buildRealApprovalEvents(result.trace);
    backendRefs = {
      kind: "real_eval" as const,
      suiteId: parsedSpec.backend.suiteId,
      scenarioId: parsedSpec.backend.scenarioId,
      tracePath: result.summary.tracePath ?? path.join(sandboxRoot, "real", "trace.json"),
    };
  }

  const outcomeScore = scoreFromStatus(outcomeStatus);
  const trajectoryScore = scoreFromStatus(trajectoryStatus);
  const controlScore = scoreFromStatus(controlStatus);
  const aggregateScore = (
    outcomeScore * parsedSpec.scoringProfile.outcomeWeight
    + trajectoryScore * parsedSpec.scoringProfile.trajectoryWeight
    + controlScore * parsedSpec.scoringProfile.controlWeight
  );
  const verdictStatus = combineStatuses([outcomeStatus, trajectoryStatus, controlStatus]);
  const capabilityScores = buildCapabilityScores({
    spec: parsedSpec,
    aggregateScore,
    familyThresholds,
  });
  const blockingFamilies = capabilityScores.filter((score) => score.blocking).map((score) => score.family);
  const evidenceBasePath = path.join(sandboxRoot, "evidence.json");
  const repairRecommendations = buildRepairRecommendations({
    validationRunId,
    spec: parsedSpec,
    evidencePath: evidenceBasePath,
    verdictStatus,
    dimensions: {
      control: controlStatus,
    },
  });
  const evidence = validationEvidenceBundleSchema.parse({
    validationSuiteRunId,
    validationRunId,
    scenarioId: parsedSpec.id,
    repoSource: parsedSpec.repoSource,
    sandboxPolicy: parsedSpec.sandboxPolicy,
    taskPrompt: parsedSpec.taskPrompt,
    sandboxRoot,
    commandLog: [],
    approvalEvents,
    backendRefs,
    verificationArtifacts: {},
    verdictExplanation: `Validation run ${validationRunId} completed under ${parsedSpec.sandboxPolicy.permissionMode}.`,
  });
  const verdict = validationVerdictSchema.parse({
    validationRunId,
    scenarioId: parsedSpec.id,
    status: verdictStatus,
    dimensions: {
      outcome: {
        status: outcomeStatus,
        score: outcomeScore,
        reason: `Outcome evaluated as ${outcomeStatus}.`,
      },
      trajectory: {
        status: trajectoryStatus,
        score: trajectoryScore,
        reason: `Trajectory evaluated as ${trajectoryStatus}.`,
      },
      control: {
        status: controlStatus,
        score: controlScore,
        reason: `Control path evaluated under ${parsedSpec.sandboxPolicy.permissionMode}.`,
      },
    },
    capabilityScores,
    aggregateScore,
    releaseGate: {
      blocked: blockingFamilies.length > 0,
      blockingFamilies,
    },
    repairRecommendations,
  });
  return persistScenarioArtifacts({
    scenario: parsedSpec,
    evidence,
    verdict,
  });
}

export async function runValidationSuite(input: RunValidationSuiteOptions): Promise<ValidationSuiteSummary> {
  await fs.mkdir(input.rootDir, { recursive: true });
  const suiteRunRoot = path.join(input.rootDir, prefixedUuid("validation_suite"));
  const validationSuiteRunId = path.basename(suiteRunRoot);
  await fs.mkdir(suiteRunRoot, { recursive: true });
  const familyThresholds = input.familyThresholds ?? {};
  const deterministicExecutor = input.executeDeterministicScenario ?? defaultDeterministicExecutor;
  const realExecutor = input.executeRealScenario ?? defaultRealExecutor;
  const store = new SqliteEvalStore(input.dataDir);

  try {
    const scenarioVerdicts: ValidationScenarioVerdictRecord[] = [];
    for (const scenario of input.scenarios) {
      scenarioVerdicts.push(
        await executeScenario(
          scenario,
          validationSuiteRunId,
          suiteRunRoot,
          input.dataDir,
          familyThresholds,
          deterministicExecutor,
          realExecutor,
        ),
      );
    }

    const allCapabilityScores = scenarioVerdicts.flatMap((record) => record.verdict.capabilityScores);
    const grouped = new Map<ValidationTaskFamily, ValidationCapabilityScore[]>();
    for (const score of allCapabilityScores) {
      const existing = grouped.get(score.family) ?? [];
      existing.push(score);
      grouped.set(score.family, existing);
    }

    const familyScores: ValidationCapabilityScore[] = [...grouped.entries()].map(([family, scores]) => {
      const threshold = familyThresholds[family] ?? DEFAULT_FAMILY_THRESHOLD;
      const score = scores.reduce((total, item) => total + item.score, 0) / scores.length;
      return {
        family,
        score,
        threshold,
        blocking: score < threshold,
      };
    });
    const aggregateScore = scenarioVerdicts.length > 0
      ? scenarioVerdicts.reduce((total, record) => total + record.verdict.aggregateScore, 0) / scenarioVerdicts.length
      : 0;
    const blockingFamilies = familyScores.filter((score) => score.blocking).map((score) => score.family);
    for (const scenarioVerdict of scenarioVerdicts) {
      await persistValidationReviewRecords({
        store,
        validationSuiteRunId,
        blockingFamilies,
        scenarioVerdict,
      });
    }
    const reviewQueueCount = (await store.listReviewItems()).length;
    const summaryArtifactPaths: ValidationArtifactPaths = {
      artifactDir: suiteRunRoot,
      summaryJsonPath: path.join(suiteRunRoot, "summary.json"),
      engineeringReportPath: path.join(suiteRunRoot, "engineering.txt"),
      productGateReportPath: path.join(suiteRunRoot, "product-gate.txt"),
    };
    const summary = validationSuiteSummarySchema.parse({
      validationSuiteRunId,
      status: combineStatuses(scenarioVerdicts.map((record) => record.verdict.status)),
      scenarioVerdicts,
      familyScores,
      aggregateScore,
      releaseGate: {
        blocked: blockingFamilies.length > 0,
        blockingFamilies,
      },
      reviewQueueCount,
      repairRecommendations: scenarioVerdicts.flatMap((record) => record.verdict.repairRecommendations),
      artifactPaths: summaryArtifactPaths,
    });

    await writeJsonFile(summaryArtifactPaths.summaryJsonPath ?? path.join(suiteRunRoot, "summary.json"), summary);
    await writeTextFile(
      summaryArtifactPaths.engineeringReportPath ?? path.join(suiteRunRoot, "engineering.txt"),
      renderValidationEngineeringView(summary),
    );
    await writeTextFile(
      summaryArtifactPaths.productGateReportPath ?? path.join(suiteRunRoot, "product-gate.txt"),
      renderValidationProductGateView(summary),
    );

    return summary;
  } finally {
    await store.close();
  }
}
