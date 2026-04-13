import type { ValidationScenarioVerdictRecord, ValidationSuiteSummary } from "./validation-schema";

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
