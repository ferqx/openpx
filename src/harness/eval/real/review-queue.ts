import { prefixedUuid } from "../../../shared/id-generators";
import type { ReviewQueueItem } from "../../../eval/eval-schema";
import type { EvalReviewQueueRecord, EvalStorePort } from "../../../persistence/ports/eval-store-port";
import type { RealTraceEvaluation } from "./evaluation";
import type { RealEvalEvolutionCandidate, RealRunTrace } from "./real-eval-schema";

/**
 * harness real-eval 失败项的 review queue。
 * 它把 trace evaluation 的失败样本转成可分诊、可跟踪的工作项。
 */
/** 持久化到 review queue 前的 real-eval review 条目 */
export type PersistedRealReviewQueueItem = {
  reviewItemId: string;
  scenarioRunId: string;
  scenarioId: string;
  runId: string;
  sourceType: "outcome_check" | "trajectory_rule";
  sourceId: string;
  severity: "medium" | "high";
  status: "failed" | "suspicious";
  failureClass: string;
  rootCauseLayer: string;
  impactedObject: string;
  nextSuggestedAction: string;
  evolutionTarget?: string;
  summary: string;
  objectRefs: ReviewQueueItem["objectRefs"];
  triageStatus: ReviewQueueItem["triageStatus"];
  createdAt: string;
};

/** review queue 持久化输入 */
type RealReviewPersistInput = {
  store: EvalStorePort;
  scenarioRunId: string;
  trace: RealRunTrace;
  evaluation: RealTraceEvaluation;
  evolutionCandidates?: RealEvalEvolutionCandidate[];
};

/** 把 evaluation review item 转成持久化形状 */
function toPersistedItem(input: {
  reviewItemId: string;
  scenarioRunId: string;
  createdAt: string;
  item: RealTraceEvaluation["reviewItems"][number];
  evolutionCandidate?: RealEvalEvolutionCandidate;
}): PersistedRealReviewQueueItem {
  return {
    reviewItemId: input.reviewItemId,
    scenarioRunId: input.scenarioRunId,
    scenarioId: input.item.scenarioId,
    runId: input.item.runId,
    sourceType: input.item.sourceType,
    sourceId: input.item.sourceId,
    severity: input.item.severity,
    status: input.item.status === "failed" ? "failed" : "suspicious",
    failureClass: input.item.failureClass,
    rootCauseLayer: input.item.rootCauseLayer,
    impactedObject: input.item.impactedObject,
    nextSuggestedAction: input.item.nextSuggestedAction,
    evolutionTarget: input.evolutionCandidate?.evolutionTarget ?? input.item.rootCauseLayer,
    summary: input.item.summary,
    objectRefs: input.item.objectRefs,
    triageStatus: "open",
    createdAt: input.createdAt,
  };
}

/** 为一次 real-eval 运行生成 review queue 条目 */
export function createRealReviewQueueItems(input: {
  scenarioRunId: string;
  trace: RealRunTrace;
  evaluation: RealTraceEvaluation;
  evolutionCandidates?: RealEvalEvolutionCandidate[];
}): PersistedRealReviewQueueItem[] {
  return input.evaluation.reviewItems.map((item) =>
    toPersistedItem({
      reviewItemId: prefixedUuid("review"),
      scenarioRunId: input.scenarioRunId,
      createdAt: new Date().toISOString(),
      item,
      evolutionCandidate: input.evolutionCandidates?.find((candidate) => candidate.rootCauseHypothesis === item.summary),
    }));
}

/** 转成基础 ReviewQueueItem */
function toBaseReviewItem(item: PersistedRealReviewQueueItem): ReviewQueueItem {
  return {
    reviewItemId: item.reviewItemId,
    scenarioRunId: item.scenarioRunId,
    scenarioId: item.scenarioId,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    severity: item.severity,
    triageStatus: item.triageStatus,
    resolutionType: undefined,
    summary: item.summary,
    objectRefs: item.objectRefs,
    ownerNote: undefined,
    followUp: undefined,
    createdAt: item.createdAt,
    closedAt: undefined,
  };
}

function toReviewRecord(item: PersistedRealReviewQueueItem): EvalReviewQueueRecord {
  return {
    item: toBaseReviewItem(item),
    metadataJson: JSON.stringify({
      version: 1,
      lane: "real-eval",
      runId: item.runId,
      failureClass: item.failureClass,
      rootCauseLayer: item.rootCauseLayer,
      impactedObject: item.impactedObject,
      nextSuggestedAction: item.nextSuggestedAction,
      evolutionTarget: item.evolutionTarget,
      status: item.status,
    }),
  };
}

export async function persistRealReviewQueueItems(input: RealReviewPersistInput): Promise<PersistedRealReviewQueueItem[]> {
  const items = createRealReviewQueueItems(input);
  await input.store.saveReviewRecords(items.map(toReviewRecord));
  return items;
}

export async function listPersistedRealReviewItems(input: {
  store: EvalStorePort;
  scenarioId?: string;
}): Promise<PersistedRealReviewQueueItem[]> {
  const records = await input.store.listReviewRecords({
    scenarioId: input.scenarioId,
  });

  return records.flatMap((record) => {
    if (!record.metadataJson) {
      return [];
    }
    const details = parseRealReviewMetadata(record.metadataJson);
    if (!details) {
      return [];
    }
    return [{
      reviewItemId: record.item.reviewItemId,
      scenarioRunId: record.item.scenarioRunId,
      scenarioId: record.item.scenarioId,
      runId: details.runId,
      sourceType: record.item.sourceType,
      sourceId: record.item.sourceId,
      severity: record.item.severity as "medium" | "high",
      status: details.status,
      failureClass: details.failureClass,
      rootCauseLayer: details.rootCauseLayer,
      impactedObject: details.impactedObject,
      nextSuggestedAction: details.nextSuggestedAction,
      evolutionTarget: details.evolutionTarget,
      summary: record.item.summary,
      objectRefs: record.item.objectRefs,
      triageStatus: record.item.triageStatus,
      createdAt: record.item.createdAt,
    }];
  });
}

function parseRealReviewMetadata(metadataJson: string): {
  runId: string;
  failureClass: string;
  rootCauseLayer: string;
  impactedObject: string;
  nextSuggestedAction: string;
  evolutionTarget?: string;
  status: "failed" | "suspicious";
} | undefined {
  const parsed = JSON.parse(metadataJson);
  if (parsed?.lane !== "real-eval") {
    return undefined;
  }
  if (
    parsed?.version !== 1
    || typeof parsed.runId !== "string"
    || typeof parsed.failureClass !== "string"
    || typeof parsed.rootCauseLayer !== "string"
    || typeof parsed.impactedObject !== "string"
    || typeof parsed.nextSuggestedAction !== "string"
    || (parsed.status !== "failed" && parsed.status !== "suspicious")
  ) {
    throw new Error("Invalid real-eval review metadata payload.");
  }

  return {
    runId: parsed.runId,
    failureClass: parsed.failureClass,
    rootCauseLayer: parsed.rootCauseLayer,
    impactedObject: parsed.impactedObject,
    nextSuggestedAction: parsed.nextSuggestedAction,
    evolutionTarget: typeof parsed.evolutionTarget === "string" ? parsed.evolutionTarget : undefined,
    status: parsed.status,
  };
}
