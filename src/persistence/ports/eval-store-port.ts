import type {
  EvalReviewQueueFilters,
  EvalScenarioResult,
  EvalSuiteRunRecord,
  ReviewQueueItem,
  UpdateReviewQueueItemInput,
} from "../../eval/eval-schema";
import type { StoragePort } from "./storage-port";

export type EvalReviewQueueRecord = {
  item: ReviewQueueItem;
  metadataJson?: string;
};

export interface EvalStorePort extends StoragePort {
  saveSuiteRun(record: EvalSuiteRunRecord): Promise<void>;
  getSuiteRun(suiteRunId: string): Promise<EvalSuiteRunRecord | undefined>;
  saveScenarioResult(result: EvalScenarioResult): Promise<void>;
  listScenarioResultsBySuiteRun(suiteRunId: string): Promise<EvalScenarioResult[]>;
  saveReviewRecords(records: EvalReviewQueueRecord[]): Promise<void>;
  saveReviewItem(item: ReviewQueueItem): Promise<void>;
  getReviewItem(reviewItemId: string): Promise<ReviewQueueItem | undefined>;
  listReviewRecords(filters?: EvalReviewQueueFilters): Promise<EvalReviewQueueRecord[]>;
  listReviewItems(filters?: EvalReviewQueueFilters): Promise<ReviewQueueItem[]>;
  updateReviewItem(input: UpdateReviewQueueItemInput): Promise<ReviewQueueItem>;
}
