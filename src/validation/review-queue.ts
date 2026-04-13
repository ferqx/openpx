import { prefixedUuid } from "../shared/id-generators";
import type { EvalReviewQueueRecord, EvalStorePort } from "../persistence/ports/eval-store-port";
import type { ReviewQueueItem } from "../eval/eval-schema";
import {
  persistedValidationReviewRecordSchema,
  type PersistedValidationReviewRecord,
  type ValidationScenarioVerdictRecord,
} from "./validation-schema";

function buildSummary(record: ValidationScenarioVerdictRecord): string {
  const repair = record.verdict.repairRecommendations[0];
  return repair?.repairPath ?? record.evidence.verdictExplanation;
}

function toReviewItem(input: {
  reviewItemId: string;
  scenarioVerdict: ValidationScenarioVerdictRecord;
  createdAt: string;
}): ReviewQueueItem {
  const repair = input.scenarioVerdict.verdict.repairRecommendations[0];
  return {
    reviewItemId: input.reviewItemId,
    scenarioRunId: input.scenarioVerdict.verdict.validationRunId,
    scenarioId: input.scenarioVerdict.scenario.id,
    sourceType: "trajectory_rule",
    sourceId: repair?.failureClass ?? "validation_failure",
    severity: repair?.severity ?? "medium",
    triageStatus: "open",
    resolutionType: undefined,
    summary: buildSummary(input.scenarioVerdict),
    objectRefs: {
      threadId: input.scenarioVerdict.scenario.repoSource.repoId,
      runIds: [input.scenarioVerdict.verdict.validationRunId],
      taskIds: [],
      approvalIds: input.scenarioVerdict.evidence.approvalEvents.map((event) => event.approvalRequestId),
    },
    ownerNote: undefined,
    followUp: undefined,
    createdAt: input.createdAt,
    closedAt: undefined,
  };
}

export function createValidationReviewRecords(input: {
  validationSuiteRunId?: string;
  blockingFamilies?: readonly string[];
  scenarioVerdict: ValidationScenarioVerdictRecord;
  createdAt?: string;
}): EvalReviewQueueRecord[] {
  if (input.scenarioVerdict.verdict.status === "passed") {
    return [];
  }
  const createdAt = input.createdAt ?? new Date().toISOString();
  return input.scenarioVerdict.verdict.repairRecommendations.map((repair) => {
    const reviewItemId = prefixedUuid("review");
    return {
      item: toReviewItem({
        reviewItemId,
        scenarioVerdict: input.scenarioVerdict,
        createdAt,
      }),
      metadataJson: JSON.stringify({
        version: 1,
        lane: "validation",
        validationSuiteRunId: input.validationSuiteRunId,
        validationRunId: input.scenarioVerdict.verdict.validationRunId,
        repoId: input.scenarioVerdict.scenario.repoSource.repoId,
        repoSnapshot: input.scenarioVerdict.scenario.repoSource.snapshot,
        permissionMode: input.scenarioVerdict.scenario.sandboxPolicy.permissionMode,
        evidenceBundlePath: input.scenarioVerdict.evidence.artifactPaths?.evidenceJsonPath ?? input.scenarioVerdict.evidence.sandboxRoot,
        scenarioArtifactDir: input.scenarioVerdict.evidence.artifactPaths?.artifactDir ?? input.scenarioVerdict.evidence.sandboxRoot,
        engineeringReportPath: input.scenarioVerdict.evidence.artifactPaths?.engineeringReportPath,
        productGateReportPath: input.scenarioVerdict.evidence.artifactPaths?.productGateReportPath,
        gateBlocked: input.scenarioVerdict.verdict.releaseGate.blocked,
        blockingFamilies: input.scenarioVerdict.verdict.releaseGate.blockingFamilies,
        contributedToBlockingFamily: input.scenarioVerdict.verdict.capabilityScores.some((score) =>
          (input.blockingFamilies ?? input.scenarioVerdict.verdict.releaseGate.blockingFamilies).includes(score.family)
        ),
        repairRecommendationId: repair.recommendationId,
      }),
    };
  });
}

export async function persistValidationReviewRecords(input: {
  store: EvalStorePort;
  validationSuiteRunId?: string;
  blockingFamilies?: readonly string[];
  scenarioVerdict: ValidationScenarioVerdictRecord;
  createdAt?: string;
}): Promise<EvalReviewQueueRecord[]> {
  const records = createValidationReviewRecords(input);
  if (records.length > 0) {
    await input.store.saveReviewRecords(records);
  }
  return records;
}

export async function listPersistedValidationReviewRecords(input: {
  store: EvalStorePort;
  scenarioId?: string;
}): Promise<PersistedValidationReviewRecord[]> {
  const records = await input.store.listReviewRecords({
    scenarioId: input.scenarioId,
  });
  return records.flatMap((record) => {
    if (!record.metadataJson) {
      return [];
    }
    const parsed = JSON.parse(record.metadataJson);
    if (parsed?.lane !== "validation") {
      return [];
    }
    return [persistedValidationReviewRecordSchema.parse({
      reviewItemId: record.item.reviewItemId,
      scenarioId: record.item.scenarioId,
      validationSuiteRunId: parsed.validationSuiteRunId,
      validationRunId: parsed.validationRunId,
      permissionMode: parsed.permissionMode,
      repairRecommendationId: parsed.repairRecommendationId,
      evidenceBundlePath: parsed.evidenceBundlePath,
      scenarioArtifactDir: parsed.scenarioArtifactDir,
      engineeringReportPath: parsed.engineeringReportPath,
      productGateReportPath: parsed.productGateReportPath,
      contributedToBlockingFamily: parsed.contributedToBlockingFamily,
    })];
  });
}
