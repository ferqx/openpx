import type {
  EvalReviewQueueFilters,
  EvalScenarioResult,
  EvalSuiteRunRecord,
  ReviewQueueItem,
  UpdateReviewQueueItemInput,
} from "../../eval/eval-schema";
import type { StoragePort } from "./storage-port";

/** review queue 记录：主 item 外加可选元数据 JSON */
export type EvalReviewQueueRecord = {
  item: ReviewQueueItem;
  metadataJson?: string;
};

/** eval 存储端口：suite run、scenario result 与 review queue 的统一持久化接口 */
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
