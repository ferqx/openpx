import type { Database } from "bun:sqlite";
import type { Run } from "../../domain/run";
import type { RunStorePort } from "../ports/run-store-port";
import { resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

type RunRow = {
  run_id: string;
  thread_id: string;
  status: Run["status"];
  trigger: Run["trigger"];
  input_text: string | null;
  active_task_id: string | null;
  started_at: string;
  ended_at: string | null;
  result_summary: string | null;
  resume_token: string | null;
  blocking_reason_json: string | null;
  ledger_state_json: string | null;
};

export class SqliteRunStore implements RunStorePort {
  private readonly db: Database;
  private readonly owned: boolean;

  constructor(path: string | Database) {
    const connection = resolveSqlite(path);
    this.db = connection.db;
    this.owned = connection.owned;
    migrateSqlite(this.db);
  }

  async save(run: Run): Promise<void> {
    this.db.run(
      `INSERT INTO runs (
        run_id, thread_id, status, trigger, input_text, active_task_id, started_at, ended_at, result_summary, resume_token, blocking_reason_json, ledger_state_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        thread_id = excluded.thread_id,
        status = excluded.status,
        trigger = excluded.trigger,
        input_text = excluded.input_text,
        active_task_id = excluded.active_task_id,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        result_summary = excluded.result_summary,
        resume_token = excluded.resume_token,
        blocking_reason_json = excluded.blocking_reason_json,
        ledger_state_json = excluded.ledger_state_json`,
      [
        run.runId,
        run.threadId,
        run.status,
        run.trigger,
        run.inputText ?? null,
        run.activeTaskId ?? null,
        run.startedAt,
        run.endedAt ?? null,
        run.resultSummary ?? null,
        run.resumeToken ?? null,
        run.blockingReason ? JSON.stringify(run.blockingReason) : null,
        run.ledgerState ? JSON.stringify(run.ledgerState) : null,
      ],
    );
  }

  async get(runId: string): Promise<Run | undefined> {
    const row = this.db
      .query<RunRow, [string]>(
        `SELECT run_id, thread_id, status, trigger, input_text, active_task_id, started_at, ended_at, result_summary, resume_token, blocking_reason_json, ledger_state_json
         FROM runs WHERE run_id = ?`,
      )
      .get(runId);

    return row ? mapRunRow(row) : undefined;
  }

  async listByThread(threadId: string): Promise<Run[]> {
    const rows = this.db
      .query<RunRow, [string]>(
        `SELECT run_id, thread_id, status, trigger, input_text, active_task_id, started_at, ended_at, result_summary, resume_token, blocking_reason_json, ledger_state_json
         FROM runs WHERE thread_id = ? ORDER BY rowid ASC`,
      )
      .all(threadId);

    return rows.map(mapRunRow);
  }

  async getLatestByThread(threadId: string): Promise<Run | undefined> {
    const row = this.db
      .query<RunRow, [string]>(
        `SELECT run_id, thread_id, status, trigger, input_text, active_task_id, started_at, ended_at, result_summary, resume_token, blocking_reason_json, ledger_state_json
         FROM runs WHERE thread_id = ? ORDER BY rowid DESC LIMIT 1`,
      )
      .get(threadId);

    return row ? mapRunRow(row) : undefined;
  }

  async close(): Promise<void> {
    if (this.owned) {
      this.db.close();
    }
  }
}

function mapRunRow(row: RunRow): Run {
  return {
    runId: row.run_id,
    threadId: row.thread_id,
    status: row.status,
    trigger: row.trigger,
    inputText: row.input_text ?? undefined,
    activeTaskId: row.active_task_id ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    resultSummary: row.result_summary ?? undefined,
    resumeToken: row.resume_token ?? undefined,
    blockingReason: row.blocking_reason_json ? JSON.parse(row.blocking_reason_json) : undefined,
    ledgerState: row.ledger_state_json ? JSON.parse(row.ledger_state_json) : undefined,
  };
}
