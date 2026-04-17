import type { ValidationScenarioVerdictRecord, ValidationSuiteSummary } from "./validation-schema";

/** 渲染单场景 engineering 视图 */
export function renderValidationScenarioEngineeringView(record: ValidationScenarioVerdictRecord): string {
  const lines = [
    "Validation engineering view",
    `scenario=${record.scenario.id}`,
    `status=${record.verdict.status}`,
    `aggregate=${record.verdict.aggregateScore.toFixed(2)}`,
    `permissionMode=${record.scenario.sandboxPolicy.permissionMode}`,
    `repo=${record.scenario.repoSource.repoId}@${record.scenario.repoSource.snapshot}`,
    `approvalEvents=${record.evidence.approvalEvents.length}`,
    `blockingFamilies=${record.verdict.releaseGate.blockingFamilies.join(",") || "none"}`,
    `outcome=${record.verdict.dimensions.outcome.status} trajectory=${record.verdict.dimensions.trajectory.status} control=${record.verdict.dimensions.control.status}`,
    `explanation=${record.evidence.verdictExplanation}`,
  ];

  for (const recommendation of record.verdict.repairRecommendations) {
    lines.push(`repair:${recommendation.failureClass} -> ${recommendation.repairPath}`);
  }

  return `${lines.join("\n")}\n`;
}

/** 渲染单场景 product gate 视图 */
export function renderValidationScenarioProductGateView(record: ValidationScenarioVerdictRecord): string {
  const lines = [
    "Validation product gate",
    `scenario=${record.scenario.id}`,
    `status=${record.verdict.status}`,
    `blocked=${record.verdict.releaseGate.blocked}`,
    `aggregate=${record.verdict.aggregateScore.toFixed(2)}`,
    `blockingFamilies=${record.verdict.releaseGate.blockingFamilies.join(",") || "none"}`,
  ];

  return `${lines.join("\n")}\n`;
}

/** 渲染 suite engineering 视图 */
export function renderValidationEngineeringView(summary: ValidationSuiteSummary): string {
  const lines = [
    "Validation engineering view",
    `suiteRun=${summary.validationSuiteRunId}`,
    `status=${summary.status}`,
    `aggregate=${summary.aggregateScore.toFixed(2)}`,
    `reviewQueue=${summary.reviewQueueCount}`,
    `blockingFamilies=${summary.releaseGate.blockingFamilies.join(",") || "none"}`,
  ];

  for (const score of summary.familyScores) {
    lines.push(
      `family:${score.family} score=${score.score.toFixed(2)} threshold=${score.threshold.toFixed(2)} blocking=${score.blocking}`,
    );
  }
  for (const verdict of summary.scenarioVerdicts) {
    lines.push(
      `scenario:${verdict.scenario.id} status=${verdict.verdict.status} aggregate=${verdict.verdict.aggregateScore.toFixed(2)} permission=${verdict.scenario.sandboxPolicy.permissionMode}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

/** 渲染 suite product gate 视图 */
export function renderValidationProductGateView(summary: ValidationSuiteSummary): string {
  const lines = [
    "Validation product gate",
    `suiteRun=${summary.validationSuiteRunId}`,
    `status=${summary.status}`,
    `blocked=${summary.releaseGate.blocked}`,
    `aggregate=${summary.aggregateScore.toFixed(2)}`,
    `blockingFamilies=${summary.releaseGate.blockingFamilies.join(",") || "none"}`,
  ];

  return `${lines.join("\n")}\n`;
}

/** 渲染 suite confidence scorecard 视图 */
export function renderValidationScorecardView(summary: ValidationSuiteSummary): string {
  const scorecard = summary.scorecard;
  const lines = [
    "Validation confidence scorecard",
    `suiteRun=${summary.validationSuiteRunId}`,
    `status=${summary.status}`,
    `blocked=${summary.releaseGate.blocked}`,
  ];

  if (!scorecard) {
    lines.push("scorecard=missing");
    return `${lines.join("\n")}\n`;
  }

  lines.push(`generatedAt=${scorecard.generatedAt}`);
  lines.push(`overallStatus=${scorecard.overallStatus}`);
  lines.push(`coreScenarioSuccessRate=${scorecard.runtimeCorrectness.coreScenarioSuccessRate.toFixed(2)}`);
  lines.push(`approvalResumeSuccessRate=${scorecard.runtimeCorrectness.approvalResumeSuccessRate.toFixed(2)}`);
  lines.push(`cancelCorrectnessRate=${scorecard.runtimeCorrectness.cancelCorrectnessRate.toFixed(2)}`);
  lines.push(`humanRecoveryCorrectnessRate=${scorecard.runtimeCorrectness.humanRecoveryCorrectnessRate.toFixed(2)}`);
  lines.push(`replayCoverage=${scorecard.observabilityCoverage.replayCoverage.toFixed(2)}`);
  lines.push(`failureReportCoverage=${scorecard.observabilityCoverage.failureReportCoverage.toFixed(2)}`);
  lines.push(`truthDiffCoverage=${scorecard.observabilityCoverage.truthDiffCoverage.toFixed(2)}`);
  lines.push(`loopEventCoverage=${scorecard.observabilityCoverage.loopEventCoverage.toFixed(2)}`);

  return `${lines.join("\n")}\n`;
}
