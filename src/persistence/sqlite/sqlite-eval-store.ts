import type { Database } from "bun:sqlite";
import {
  evalReviewQueueFiltersSchema,
  evalReviewQueueItemSchema,
  evalScenarioResultSchema,
  evalSuiteRunRecordSchema,
  type EvalScenarioResult,
  type EvalSuiteRunRecord,
  type EvalReviewQueueFilters,
  type ReviewQueueItem,
  type UpdateReviewQueueItemInput,
  updateReviewQueueItemInputSchema,
} from "../../eval/eval-schema";
import type { EvalReviewQueueRecord, EvalStorePort } from "../ports/eval-store-port";
import { closeSqliteHandle, resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

/** eval_suite_runs 表行结构 */
type EvalSuiteRunRow = {
  suite_run_id: string;
  suite_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
};

/** eval_scenario_results 表行结构 */
type EvalScenarioResultRow = {
  scenario_run_id: string;
  suite_run_id: string | null;
  scenario_id: string;
  scenario_version: number;
  family: string;
  status: string;
  thread_id: string | null;
  primary_run_id: string | null;
  primary_task_id: string | null;
  comparable_json: string;
  outcome_results_json: string;
  trajectory_results_json: string;
  created_at: string;
  completed_at: string;
};

/** eval_review_queue 表行结构 */
type EvalReviewQueueRow = {
  review_item_id: string;
  scenario_run_id: string;
  scenario_id: string;
  source_type: string;
  source_id: string;
  severity: string;
  triage_status: string;
  resolution_type: string | null;
  summary: string;
  object_refs_json: string;
  owner_note: string | null;
  follow_up_json: string | null;
  metadata_json: string | null;
  created_at: string;
  closed_at: string | null;
};

/** SQLite eval 存储：保存 suite run、scenario result 和 review queue */
export class SqliteEvalStore implements EvalStorePort {
  private readonly db: Database;
  private readonly owned: boolean;

  constructor(path: string | Database) {
    const connection = resolveSqlite(path);
    this.db = connection.db;
    this.owned = connection.owned;
    migrateSqlite(this.db);
  }

  async saveSuiteRun(record: EvalSuiteRunRecord): Promise<void> {
    const parsed = evalSuiteRunRecordSchema.parse(record);
    this.db.run(
      `INSERT INTO eval_suite_runs (suite_run_id, suite_id, status, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(suite_run_id) DO UPDATE SET
         suite_id = excluded.suite_id,
         status = excluded.status,
         started_at = excluded.started_at,
         completed_at = excluded.completed_at`,
      [parsed.suiteRunId, parsed.suiteId, parsed.status, parsed.startedAt, parsed.completedAt ?? null],
    );
  }

  async getSuiteRun(suiteRunId: string): Promise<EvalSuiteRunRecord | undefined> {
    const row = this.db
      .query<EvalSuiteRunRow, [string]>("SELECT * FROM eval_suite_runs WHERE suite_run_id = ?")
      .get(suiteRunId);
    return row ? mapSuiteRunRow(row) : undefined;
  }

  async saveScenarioResult(result: EvalScenarioResult): Promise<void> {
    const parsed = evalScenarioResultSchema.parse(result);
    this.db.run(
      `INSERT INTO eval_scenario_results (
        scenario_run_id, suite_run_id, scenario_id, scenario_version, family, status,
        thread_id, primary_run_id, primary_task_id, comparable_json, outcome_results_json,
        trajectory_results_json, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scenario_run_id) DO UPDATE SET
        suite_run_id = excluded.suite_run_id,
        scenario_id = excluded.scenario_id,
        scenario_version = excluded.scenario_version,
        family = excluded.family,
        status = excluded.status,
        thread_id = excluded.thread_id,
        primary_run_id = excluded.primary_run_id,
        primary_task_id = excluded.primary_task_id,
        comparable_json = excluded.comparable_json,
        outcome_results_json = excluded.outcome_results_json,
        trajectory_results_json = excluded.trajectory_results_json,
        created_at = excluded.created_at,
        completed_at = excluded.completed_at`,
      [
        parsed.scenarioRunId,
        parsed.suiteRunId ?? null,
        parsed.scenarioId,
        parsed.scenarioVersion,
        parsed.family,
        parsed.status,
        parsed.threadId ?? null,
        parsed.primaryRunId ?? null,
        parsed.primaryTaskId ?? null,
        JSON.stringify(parsed.comparable),
        JSON.stringify(parsed.outcomeResults),
        JSON.stringify(parsed.trajectoryResults),
        parsed.createdAt,
        parsed.completedAt,
      ],
    );
  }

  async listScenarioResultsBySuiteRun(suiteRunId: string): Promise<EvalScenarioResult[]> {
    const rows = this.db
      .query<EvalScenarioResultRow, [string]>(
        "SELECT * FROM eval_scenario_results WHERE suite_run_id = ? ORDER BY created_at ASC",
      )
      .all(suiteRunId);
    return rows.map(mapScenarioResultRow);
  }

  async saveReviewRecords(records: EvalReviewQueueRecord[]): Promise<void> {
    const parsedRecords = records.map((record) => ({
      item: evalReviewQueueItemSchema.parse(record.item),
      metadataJson: record.metadataJson ?? null,
    }));

    this.db.transaction((entries: typeof parsedRecords) => {
      for (const record of entries) {
        this.db.run(
          `INSERT INTO eval_review_queue (
            review_item_id, scenario_run_id, scenario_id, source_type, source_id, severity, triage_status, resolution_type,
            summary, object_refs_json, owner_note, follow_up_json, metadata_json, created_at, closed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(review_item_id) DO UPDATE SET
            scenario_run_id = excluded.scenario_run_id,
            scenario_id = excluded.scenario_id,
            source_type = excluded.source_type,
            source_id = excluded.source_id,
            severity = excluded.severity,
            triage_status = excluded.triage_status,
            resolution_type = excluded.resolution_type,
            summary = excluded.summary,
            object_refs_json = excluded.object_refs_json,
            owner_note = excluded.owner_note,
            follow_up_json = excluded.follow_up_json,
            metadata_json = COALESCE(excluded.metadata_json, eval_review_queue.metadata_json),
            created_at = excluded.created_at,
            closed_at = excluded.closed_at`,
          [
            record.item.reviewItemId,
            record.item.scenarioRunId,
            record.item.scenarioId,
            record.item.sourceType,
            record.item.sourceId,
            record.item.severity,
            record.item.triageStatus,
            record.item.resolutionType ?? null,
            record.item.summary,
            JSON.stringify(record.item.objectRefs),
            record.item.ownerNote ?? null,
            record.item.followUp ? JSON.stringify(record.item.followUp) : null,
            record.metadataJson,
            record.item.createdAt,
            record.item.closedAt ?? null,
          ],
        );
      }
    })(parsedRecords);
  }

  async saveReviewItem(item: ReviewQueueItem): Promise<void> {
    await this.saveReviewRecords([{ item }]);
  }

  async getReviewItem(reviewItemId: string): Promise<ReviewQueueItem | undefined> {
    const row = this.db
      .query<EvalReviewQueueRow, [string]>("SELECT * FROM eval_review_queue WHERE review_item_id = ?")
      .get(reviewItemId);
    return row ? mapReviewQueueRow(row) : undefined;
  }

  async listReviewItems(filters?: EvalReviewQueueFilters): Promise<ReviewQueueItem[]> {
    const records = await this.listReviewRecords(filters);
    return records.map((record) => record.item);
  }

  async listReviewRecords(filters?: EvalReviewQueueFilters): Promise<EvalReviewQueueRecord[]> {
    const parsedFilters = evalReviewQueueFiltersSchema.parse(filters ?? {});
    const clauses: string[] = [];
    const values: string[] = [];

    if (parsedFilters.triageStatus) {
      clauses.push("triage_status = ?");
      values.push(parsedFilters.triageStatus);
    }
    if (parsedFilters.severity) {
      clauses.push("severity = ?");
      values.push(parsedFilters.severity);
    }
    if (parsedFilters.scenarioId) {
      clauses.push("scenario_id = ?");
      values.push(parsedFilters.scenarioId);
    }
    if (parsedFilters.sourceType) {
      clauses.push("source_type = ?");
      values.push(parsedFilters.sourceType);
    }
    if (parsedFilters.resolutionType) {
      clauses.push("resolution_type = ?");
      values.push(parsedFilters.resolutionType);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .query<EvalReviewQueueRow, string[]>(`SELECT * FROM eval_review_queue ${whereClause} ORDER BY created_at ASC`)
      .all(...values);
    return rows.map((row) => ({
      item: mapReviewQueueRow(row),
      metadataJson: row.metadata_json ?? undefined,
    }));
  }

  async updateReviewItem(input: UpdateReviewQueueItemInput): Promise<ReviewQueueItem> {
    const parsed = updateReviewQueueItemInputSchema.parse(input);
    const existing = await this.getReviewItem(parsed.reviewItemId);
    if (!existing) {
      throw new Error(`Review item not found: ${parsed.reviewItemId}`);
    }

    const next = evalReviewQueueItemSchema.parse({
      ...existing,
      triageStatus: parsed.triageStatus ?? existing.triageStatus,
      resolutionType: parsed.resolutionType ?? existing.resolutionType,
      ownerNote: parsed.ownerNote ?? existing.ownerNote,
      followUp: parsed.followUp ?? existing.followUp,
      closedAt: parsed.closedAt ?? existing.closedAt,
    });
    await this.saveReviewItem(next);
    return next;
  }

  async close(): Promise<void> {
    if (this.owned) {
      closeSqliteHandle(this.db);
    }
  }
}

function mapSuiteRunRow(row: EvalSuiteRunRow): EvalSuiteRunRecord {
  return evalSuiteRunRecordSchema.parse({
    suiteRunId: row.suite_run_id,
    suiteId: row.suite_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
  });
}

function mapScenarioResultRow(row: EvalScenarioResultRow): EvalScenarioResult {
  return evalScenarioResultSchema.parse({
    scenarioRunId: row.scenario_run_id,
    suiteRunId: row.suite_run_id ?? undefined,
    scenarioId: row.scenario_id,
    scenarioVersion: row.scenario_version,
    family: row.family,
    status: row.status,
    threadId: row.thread_id ?? undefined,
    primaryRunId: row.primary_run_id ?? undefined,
    primaryTaskId: row.primary_task_id ?? undefined,
    comparable: JSON.parse(row.comparable_json),
    outcomeResults: JSON.parse(row.outcome_results_json),
    trajectoryResults: JSON.parse(row.trajectory_results_json),
    createdAt: row.created_at,
    completedAt: row.completed_at,
  });
}

function mapReviewQueueRow(row: EvalReviewQueueRow): ReviewQueueItem {
  return evalReviewQueueItemSchema.parse({
    reviewItemId: row.review_item_id,
    scenarioRunId: row.scenario_run_id,
    scenarioId: row.scenario_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    severity: row.severity,
    triageStatus: row.triage_status,
    resolutionType: row.resolution_type ?? undefined,
    summary: row.summary,
    objectRefs: JSON.parse(row.object_refs_json),
    ownerNote: row.owner_note ?? undefined,
    followUp: row.follow_up_json ? JSON.parse(row.follow_up_json) : undefined,
    createdAt: row.created_at,
    closedAt: row.closed_at ?? undefined,
  });
}
