import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prefixedUuid } from "../shared/id-generators";
import { findEvalScenario } from "../eval/scenarios";
import { runScenario } from "../eval/scenario-runner";
import type { EvalScenarioResult } from "../eval/eval-schema";
import { SqliteEvalStore } from "../persistence/sqlite/sqlite-eval-store";
import { collectRuntimeEvidence } from "../harness/eval/runtime/collector";
import { buildRuntimeFailureReport, renderRuntimeFailureReportMarkdown } from "../harness/eval/runtime/failure-report";
import { buildRuntimeReplay, renderRuntimeReplayMarkdown } from "../harness/eval/runtime/replay";
import { analyzeRuntimeTruth } from "../harness/eval/runtime/truth-model";
import { diffRuntimeTruth } from "../harness/eval/runtime/truth-diff";
import { findRealEvalScenario } from "../harness/eval/real/scenarios";
import { RealSampleExecutionError, runRealSample } from "../harness/eval/real/sample-runner";
import { evaluateRealTrace } from "../harness/eval/real/evaluation";
import type { RealTraceEvaluation } from "../harness/eval/real/evaluation";
import type { RealRunTrace, RealEvalScenarioResult } from "../harness/eval/real/real-eval-schema";
import {
  renderValidationEngineeringView,
  renderValidationProductGateView,
  renderValidationScorecardView,
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
  type ValidationAnalyzerCoverage,
  type ValidationAnalyzerVerdict,
  type ValidationScorecard,
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

function isNestedPath(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

async function provisionSandbox(spec: ValidationScenarioSpec, suiteRunRoot: string): Promise<{
  sandboxRoot: string;
  sandboxRepoRoot: string;
}> {
  const rootInsideRepo = isNestedPath(spec.repoSource.localPath, suiteRunRoot);
  const sandboxRoot = rootInsideRepo
    ? await fs.mkdtemp(path.join(os.tmpdir(), `openpx-validation-sandbox-${spec.id}-`))
    : path.join(suiteRunRoot, spec.id);
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

function buildRealApprovalEventsFromError(error: unknown): ValidationApprovalEvent[] {
  if (!(error instanceof RealSampleExecutionError)) {
    return [];
  }
  return error.evidence.approvalPathEvidence.approvalRequestObserved
    ? [
        {
          approvalRequestId: "unknown_approval_request",
          status: "requested",
          summary: error.evidence.approvalPathEvidence.recommendationReason ?? error.message,
          source: "backend_trace",
        },
      ]
    : [];
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
  const currentPaths = record.evidence.artifactPaths;
  const artifactPaths: ValidationArtifactPaths = {
    artifactDir,
    evidenceJsonPath: currentPaths?.evidenceJsonPath ?? path.join(artifactDir, "evidence.json"),
    verdictJsonPath: currentPaths?.verdictJsonPath ?? path.join(artifactDir, "verdict.json"),
    engineeringReportPath: currentPaths?.engineeringReportPath ?? path.join(artifactDir, "engineering.txt"),
    productGateReportPath: currentPaths?.productGateReportPath ?? path.join(artifactDir, "product-gate.txt"),
    replayJsonPath: currentPaths?.replayJsonPath,
    replayMarkdownPath: currentPaths?.replayMarkdownPath,
    failureJsonPath: currentPaths?.failureJsonPath,
    failureMarkdownPath: currentPaths?.failureMarkdownPath,
    truthDiffJsonPath: currentPaths?.truthDiffJsonPath,
    diagnosticsJsonPath: currentPaths?.diagnosticsJsonPath,
    scorecardJsonPath: currentPaths?.scorecardJsonPath,
    scorecardMarkdownPath: currentPaths?.scorecardMarkdownPath,
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

type ScenarioAnalyzerMetrics = {
  replayGenerated: boolean;
  failureReportGenerated: boolean;
  truthDiffGenerated: boolean;
  loopEventCoverage: number;
};

function buildReportsRoot(suiteRunRoot: string): string {
  return path.join(path.dirname(path.dirname(suiteRunRoot)), "reports");
}

function buildScenarioReportPaths(input: {
  reportsRoot: string;
  scenarioId: string;
  validationRunId: string;
}): ValidationArtifactPaths {
  const replayDir = path.join(input.reportsRoot, "replay");
  const failureDir = path.join(input.reportsRoot, "failures");
  return {
    artifactDir: "",
    replayJsonPath: path.join(replayDir, `${input.scenarioId}-${input.validationRunId}.json`),
    replayMarkdownPath: path.join(replayDir, `${input.scenarioId}-${input.validationRunId}.md`),
    truthDiffJsonPath: path.join(replayDir, `${input.scenarioId}-${input.validationRunId}-truth-diff.json`),
    diagnosticsJsonPath: path.join(replayDir, `${input.scenarioId}-${input.validationRunId}-diagnostics.json`),
    failureJsonPath: path.join(failureDir, `${input.scenarioId}-${input.validationRunId}.json`),
    failureMarkdownPath: path.join(failureDir, `${input.scenarioId}-${input.validationRunId}.md`),
  };
}

async function ensureParentDirectories(paths: ValidationArtifactPaths): Promise<void> {
  const targets = [
    paths.replayJsonPath,
    paths.replayMarkdownPath,
    paths.truthDiffJsonPath,
    paths.diagnosticsJsonPath,
    paths.failureJsonPath,
    paths.failureMarkdownPath,
    paths.scorecardJsonPath,
    paths.scorecardMarkdownPath,
  ].filter((value): value is string => Boolean(value));

  await Promise.all(targets.map((target) => fs.mkdir(path.dirname(target), { recursive: true })));
}

async function runPostRunAnalyzers(input: {
  suiteRunRoot: string;
  record: ValidationScenarioVerdictRecord;
  deterministicWorkspaceRoot?: string;
  deterministicRuntimeDataDir?: string;
  realTrace?: RealRunTrace;
}): Promise<{
  record: ValidationScenarioVerdictRecord;
    metrics: ScenarioAnalyzerMetrics;
  }> {
  const reportsRoot = buildReportsRoot(input.suiteRunRoot);
  const reportPaths = buildScenarioReportPaths({
    reportsRoot,
    scenarioId: input.record.scenario.id,
    validationRunId: input.record.verdict.validationRunId,
  });
  await ensureParentDirectories(reportPaths);

  const analyzerVerdicts: ValidationAnalyzerVerdict[] = [];
  let metrics: ScenarioAnalyzerMetrics = {
    replayGenerated: false,
    failureReportGenerated: false,
    truthDiffGenerated: false,
    loopEventCoverage: 0,
  };

  if (input.deterministicRuntimeDataDir) {
    const evidence = await collectRuntimeEvidence({
      workspaceRoot: input.deterministicWorkspaceRoot ?? input.record.evidence.sandboxRoot,
      dataDir: input.deterministicRuntimeDataDir,
    });
    const truthDiff = diffRuntimeTruth(evidence);
    const analysis = analyzeRuntimeTruth({ evidence, truthDiff });
    const replay = buildRuntimeReplay({
      evidence,
      analysis,
      truthDiff,
    });
    await writeJsonFile(reportPaths.replayJsonPath ?? "", replay);
    await writeTextFile(reportPaths.replayMarkdownPath ?? "", renderRuntimeReplayMarkdown(replay));
    await writeJsonFile(reportPaths.truthDiffJsonPath ?? "", truthDiff);
    await writeJsonFile(reportPaths.diagnosticsJsonPath ?? "", {
      analysis,
      truthPrecedence: ["stores", "execution_ledger", "event_log", "snapshot_projection"],
    });
    analyzerVerdicts.push({
      analyzerId: "replay",
      status: "passed",
      reason: "Runtime replay artifacts generated from deterministic runtime evidence.",
      evidenceRefs: [`artifact:${reportPaths.replayJsonPath}`],
    });
    analyzerVerdicts.push({
      analyzerId: "truth_diff",
      status: truthDiff.differences.length === 0 ? "passed" : "suspicious",
      reason:
        truthDiff.differences.length === 0
          ? "No durable truth/projection drift detected."
          : `Detected ${truthDiff.differences.length} durable truth/projection mismatches.`,
      evidenceRefs: [`artifact:${reportPaths.truthDiffJsonPath}`],
    });
    analyzerVerdicts.push({
      analyzerId: "retention_gc",
      status: analysis.issues.some((issue) => issue.code === "active_state_not_cleaned") ? "suspicious" : "passed",
      reason:
        analysis.issues.some((issue) => issue.code === "active_state_not_cleaned")
          ? "Completed run still exposes active runtime state."
          : "No active-state cleanup drift detected for this runtime evidence.",
      evidenceRefs: [`artifact:${reportPaths.diagnosticsJsonPath}`],
    });
    analyzerVerdicts.push({
      analyzerId: "event_consistency",
      status: analysis.issues.some((issue) => issue.code === "waiting_approval_without_suspension" || issue.code === "unknown_after_crash_without_human_recovery")
        ? "failed"
        : analysis.loopEventCoverage > 0
          ? "passed"
          : "suspicious",
      reason:
        analysis.issues.some((issue) => issue.code === "waiting_approval_without_suspension" || issue.code === "unknown_after_crash_without_human_recovery")
          ? "Durable runtime evidence contains inconsistent recovery semantics."
          : analysis.loopEventCoverage > 0
            ? "Loop events are present and consistent in durable evidence."
            : "No durable loop events were available; event consistency is only partially observable.",
      evidenceRefs: [`artifact:${reportPaths.diagnosticsJsonPath}`],
    });

    metrics = {
      replayGenerated: true,
      failureReportGenerated: false,
      truthDiffGenerated: true,
      loopEventCoverage: analysis.loopEventCoverage,
    };

    if (input.record.verdict.status !== "passed" || analysis.issues.length > 0) {
      const failureReport = buildRuntimeFailureReport({
        replay,
        analysis,
      });
      await writeJsonFile(reportPaths.failureJsonPath ?? "", failureReport);
      await writeTextFile(reportPaths.failureMarkdownPath ?? "", renderRuntimeFailureReportMarkdown(failureReport));
      analyzerVerdicts.push({
        analyzerId: "failure_report",
        status: input.record.verdict.status === "failed" ? "failed" : "suspicious",
        reason: "Runtime failure report generated for non-passing or inconsistent execution evidence.",
        evidenceRefs: [`artifact:${reportPaths.failureJsonPath}`],
      });
      metrics.failureReportGenerated = true;
    }
  } else if (input.realTrace) {
    const replayPayload = {
      metadata: {
        threadId: input.realTrace.threadId,
        runId: input.realTrace.runId,
        taskId: input.realTrace.taskId,
        scenarioId: input.realTrace.scenarioId,
        promptVariantId: input.realTrace.promptVariantId,
      },
      plannerEvidence: input.realTrace.plannerEvidence,
      approvalPathEvidence: input.realTrace.approvalPathEvidence,
      recoveryMode: input.realTrace.recoveryMode ?? "none",
      milestones: input.realTrace.milestones,
      comparable: input.realTrace.comparable,
    };
    await writeJsonFile(reportPaths.replayJsonPath ?? "", replayPayload);
    await writeTextFile(
      reportPaths.replayMarkdownPath ?? "",
      [
        "# Real Runtime Replay",
        "",
        `- scenarioId: ${input.realTrace.scenarioId}`,
        `- threadId: ${input.realTrace.threadId}`,
        `- runId: ${input.realTrace.runId}`,
        `- taskId: ${input.realTrace.taskId}`,
        "",
        "## Milestones",
        ...input.realTrace.milestones.map((item) => `- ${item.kind}${item.summary ? ` :: ${item.summary}` : ""}`),
      ].join("\n"),
    );
    await writeJsonFile(reportPaths.diagnosticsJsonPath ?? "", {
      mode: "real_trace_only",
      tracePath: input.record.evidence.backendRefs.kind === "real_eval" ? input.record.evidence.backendRefs.tracePath : undefined,
    });
    analyzerVerdicts.push({
      analyzerId: "replay",
      status: "passed",
      reason: "Replay artifacts generated from durable real-eval trace.",
      evidenceRefs: [`artifact:${reportPaths.replayJsonPath}`],
    });
    analyzerVerdicts.push({
      analyzerId: "truth_diff",
      status: "suspicious",
      reason: "Truth diff is unavailable for trace-only real-eval evidence.",
      evidenceRefs: [`artifact:${reportPaths.diagnosticsJsonPath}`],
    });
    metrics = {
      replayGenerated: true,
      failureReportGenerated: false,
      truthDiffGenerated: false,
      loopEventCoverage: 0,
    };
    if (input.record.verdict.status !== "passed") {
      const failurePayload = {
        scenarioId: input.realTrace.scenarioId,
        status: input.record.verdict.status,
        tracePath: input.record.evidence.backendRefs.kind === "real_eval" ? input.record.evidence.backendRefs.tracePath : undefined,
        recommendation: "inspect stored real trace and replay outcome/trajectory evaluation",
      };
      await writeJsonFile(reportPaths.failureJsonPath ?? "", failurePayload);
      await writeTextFile(
        reportPaths.failureMarkdownPath ?? "",
        `# Real Runtime Failure Report\n\n- scenarioId: ${input.realTrace.scenarioId}\n- status: ${input.record.verdict.status}\n- recommendation: inspect stored real trace and replay outcome/trajectory evaluation\n`,
      );
      analyzerVerdicts.push({
        analyzerId: "failure_report",
        status: input.record.verdict.status,
        reason: "Failure report generated from non-passing real-eval trace.",
        evidenceRefs: [`artifact:${reportPaths.failureJsonPath}`],
      });
      metrics.failureReportGenerated = true;
    }
  } else if (input.record.evidence.backendRefs.kind === "real_eval" && input.record.verdict.status !== "passed") {
    const failurePayload = {
      scenarioId: input.record.scenario.id,
      status: input.record.verdict.status,
      tracePath: input.record.evidence.backendRefs.tracePath,
      recommendation: "inspect real-eval sample execution failure; no trace was produced",
      approvalEvents: input.record.evidence.approvalEvents,
    };
    await writeJsonFile(reportPaths.failureJsonPath ?? "", failurePayload);
    await writeTextFile(
      reportPaths.failureMarkdownPath ?? "",
      `# Real Runtime Failure Report\n\n- scenarioId: ${input.record.scenario.id}\n- status: ${input.record.verdict.status}\n- tracePath: ${input.record.evidence.backendRefs.tracePath}\n- recommendation: inspect real-eval sample execution failure; no trace was produced\n`,
    );
    analyzerVerdicts.push({
      analyzerId: "failure_report",
      status: input.record.verdict.status,
      reason: "Failure report generated from real-eval sample execution failure without trace.",
      evidenceRefs: [`artifact:${reportPaths.failureJsonPath}`],
    });
    metrics = {
      replayGenerated: false,
      failureReportGenerated: true,
      truthDiffGenerated: false,
      loopEventCoverage: 0,
    };
  }

  return {
    record: {
      ...input.record,
      evidence: {
        ...input.record.evidence,
        postRunAnalyzers: analyzerVerdicts,
        artifactPaths: {
          ...input.record.evidence.artifactPaths,
          ...reportPaths,
        },
      },
    },
    metrics,
  };
}

function calculateRatio(values: boolean[]): number {
  if (values.length === 0) {
    return 1;
  }
  return values.filter(Boolean).length / values.length;
}

function calculateScenarioRate(
  records: ValidationScenarioVerdictRecord[],
  predicate: (record: ValidationScenarioVerdictRecord) => boolean,
): number {
  const matched = records.filter(predicate);
  if (matched.length === 0) {
    return records.length === 0 ? 1 : calculateRatio(records.map((record) => record.verdict.status === "passed"));
  }
  return calculateRatio(matched.map((record) => record.verdict.status === "passed"));
}

function buildValidationScorecard(input: {
  summary: Omit<ValidationSuiteSummary, "scorecard">;
  analyzerCoverage: ValidationAnalyzerCoverage;
}): ValidationScorecard {
  return {
    generatedAt: new Date().toISOString(),
    overallStatus: input.summary.status,
    runtimeCorrectness: {
      coreScenarioSuccessRate: calculateRatio(input.summary.scenarioVerdicts.map((record) => record.verdict.status === "passed")),
      approvalResumeSuccessRate: calculateScenarioRate(
        input.summary.scenarioVerdicts,
        (record) => record.scenario.taskFamily.primary === "approval_control",
      ),
      cancelCorrectnessRate: calculateScenarioRate(
        input.summary.scenarioVerdicts,
        (record) => record.scenario.id.includes("cancel"),
      ),
      humanRecoveryCorrectnessRate: calculateScenarioRate(
        input.summary.scenarioVerdicts,
        (record) =>
          record.scenario.taskFamily.primary === "recovery_consistency"
          || record.scenario.id.includes("recovery")
          || record.scenario.id.includes("legacy")
          || record.scenario.id.includes("version-mismatch"),
      ),
    },
    observabilityCoverage: input.analyzerCoverage,
    gate: input.summary.releaseGate,
  };
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
  let deterministicRuntimeDataDir: string | undefined;
  let realTrace: RealRunTrace | undefined;

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
    deterministicRuntimeDataDir = path.join(sandboxRoot, "deterministic", "runtime.db");
    backendRefs = {
      kind: "deterministic_eval" as const,
      suiteId: parsedSpec.backend.suiteId,
      scenarioRunId: result.scenarioRunId,
    };
  } else {
    const acceptanceStatus = await runAcceptanceChecks(parsedSpec.acceptanceChecks, sandboxRepoRoot);
    try {
      const result = await realExecutor({
        spec: parsedSpec,
        sandboxRoot,
        sandboxRepoRoot,
        dataDir,
      });
      outcomeStatus = combineStatuses([result.summary.status, result.evaluationStatus, acceptanceStatus]);
      trajectoryStatus = result.evaluationStatus;
      controlStatus = parsedSpec.sandboxPolicy.permissionMode === "guarded"
        ? (result.trace && buildRealApprovalEvents(result.trace).length > 0 ? "passed" : "failed")
        : "passed";
      realTrace = result.trace;
      approvalEvents = buildRealApprovalEvents(result.trace);
      backendRefs = {
        kind: "real_eval" as const,
        suiteId: parsedSpec.backend.suiteId,
        scenarioId: parsedSpec.backend.scenarioId,
        tracePath: result.summary.tracePath ?? path.join(sandboxRoot, "real", "trace.json"),
      };
    } catch (error) {
      outcomeStatus = combineStatuses(["failed", acceptanceStatus]);
      trajectoryStatus = "failed";
      controlStatus = parsedSpec.sandboxPolicy.permissionMode === "guarded" ? "failed" : "passed";
      approvalEvents = buildRealApprovalEventsFromError(error);
      backendRefs = {
        kind: "real_eval" as const,
        suiteId: parsedSpec.backend.suiteId,
        scenarioId: parsedSpec.backend.scenarioId,
        tracePath: path.join(sandboxRoot, "real", "artifacts", "trace.json"),
      };
    }
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
    postRunAnalyzers: [],
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
  const analyzed = await runPostRunAnalyzers({
    suiteRunRoot,
    record: {
      scenario: parsedSpec,
      evidence,
      verdict,
    },
    deterministicWorkspaceRoot: sandboxRepoRoot,
    deterministicRuntimeDataDir,
    realTrace,
  });
  return persistScenarioArtifacts(analyzed.record);
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
    const analyzerCoverage: ValidationAnalyzerCoverage = {
      replayCoverage: calculateRatio(
        scenarioVerdicts.map((record) => Boolean(record.evidence.artifactPaths?.replayJsonPath)),
      ),
      failureReportCoverage: calculateRatio(
        scenarioVerdicts.map((record) =>
          record.verdict.status === "passed"
            ? true
            : Boolean(record.evidence.artifactPaths?.failureJsonPath),
        ),
      ),
      truthDiffCoverage: calculateRatio(
        scenarioVerdicts.map((record) => Boolean(record.evidence.artifactPaths?.truthDiffJsonPath)),
      ),
      loopEventCoverage:
        scenarioVerdicts.length === 0
          ? 1
          : scenarioVerdicts.reduce((total, record) => {
              const analyzer = record.evidence.postRunAnalyzers.find((item) => item.analyzerId === "event_consistency");
              if (!analyzer) {
                return total;
              }
              return total + (analyzer.status === "passed" ? 1 : analyzer.status === "suspicious" ? 0.5 : 0);
            }, 0) / scenarioVerdicts.length,
    };
    const summaryArtifactPaths: ValidationArtifactPaths = {
      artifactDir: suiteRunRoot,
      summaryJsonPath: path.join(suiteRunRoot, "summary.json"),
      engineeringReportPath: path.join(suiteRunRoot, "engineering.txt"),
      productGateReportPath: path.join(suiteRunRoot, "product-gate.txt"),
      scorecardJsonPath: path.join(buildReportsRoot(suiteRunRoot), "scorecards", `${validationSuiteRunId}.json`),
      scorecardMarkdownPath: path.join(buildReportsRoot(suiteRunRoot), "scorecards", `${validationSuiteRunId}.md`),
    };
    await ensureParentDirectories(summaryArtifactPaths);
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
      analyzerCoverage,
      artifactPaths: summaryArtifactPaths,
    });
    const scorecard = buildValidationScorecard({
      summary,
      analyzerCoverage,
    });
    const summaryWithScorecard = validationSuiteSummarySchema.parse({
      ...summary,
      scorecard,
    });

    await writeJsonFile(summaryArtifactPaths.summaryJsonPath ?? path.join(suiteRunRoot, "summary.json"), summaryWithScorecard);
    await writeTextFile(
      summaryArtifactPaths.engineeringReportPath ?? path.join(suiteRunRoot, "engineering.txt"),
      renderValidationEngineeringView(summaryWithScorecard),
    );
    await writeTextFile(
      summaryArtifactPaths.productGateReportPath ?? path.join(suiteRunRoot, "product-gate.txt"),
      renderValidationProductGateView(summaryWithScorecard),
    );
    await writeJsonFile(summaryArtifactPaths.scorecardJsonPath ?? path.join(suiteRunRoot, "scorecard.json"), scorecard);
    await writeTextFile(
      summaryArtifactPaths.scorecardMarkdownPath ?? path.join(suiteRunRoot, "scorecard.md"),
      renderValidationScorecardView(summaryWithScorecard),
    );

    return summaryWithScorecard;
  } finally {
    await store.close();
  }
}
