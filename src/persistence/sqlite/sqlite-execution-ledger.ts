import type { Database } from "bun:sqlite";
import type { ExecutionLedgerEntry, ExecutionLedgerPort, ExecutionStatus } from "../ports/execution-ledger-port";
import { resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

type LedgerRow = {
  execution_id: string;
  thread_id: string;
  run_id: string | null;
  task_id: string;
  tool_call_id: string;
  tool_name: string;
  args_json: string;
  status: ExecutionStatus;
  result_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export class SqliteExecutionLedger implements ExecutionLedgerPort {
  private readonly db: Database;
  private readonly owned: boolean;

  constructor(path: string | Database) {
    const connection = resolveSqlite(path);
    this.db = connection.db;
    this.owned = connection.owned;
    migrateSqlite(this.db);
  }

  async save(entry: ExecutionLedgerEntry): Promise<void> {
    this.db.run(
      `INSERT INTO execution_ledger (
        execution_id, thread_id, run_id, task_id, tool_call_id, tool_name, args_json, 
        status, result_json, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(execution_id) DO UPDATE SET
        status = excluded.status,
        result_json = excluded.result_json,
        error = excluded.error,
        updated_at = excluded.updated_at`,
      [
        entry.executionId,
        entry.threadId,
        entry.runId ?? null,
        entry.taskId,
        entry.toolCallId,
        entry.toolName,
        entry.argsJson,
        entry.status,
        entry.resultJson ?? null,
        entry.error ?? null,
        entry.createdAt,
        entry.updatedAt,
      ],
    );
  }

  async get(executionId: string): Promise<ExecutionLedgerEntry | undefined> {
    const row = this.db
      .query<LedgerRow, [string]>("SELECT * FROM execution_ledger WHERE execution_id = ?")
      .get(executionId);
    return row ? mapLedgerRow(row) : undefined;
  }

  async listByThread(threadId: string): Promise<ExecutionLedgerEntry[]> {
    const rows = this.db
      .query<LedgerRow, [string]>("SELECT * FROM execution_ledger WHERE thread_id = ? ORDER BY created_at ASC")
      .all(threadId);
    return rows.map(mapLedgerRow);
  }

  async findUncertain(threadId: string): Promise<ExecutionLedgerEntry[]> {
    const rows = this.db
      .query<LedgerRow, [string]>(
        "SELECT * FROM execution_ledger WHERE thread_id = ? AND status IN ('started', 'planned') ORDER BY created_at ASC",
      )
      .all(threadId);
    return rows.map(mapLedgerRow);
  }

  async close(): Promise<void> {
    if (this.owned) {
      this.db.close();
    }
  }
}

function mapLedgerRow(row: LedgerRow): ExecutionLedgerEntry {
  return {
    executionId: row.execution_id,
    threadId: row.thread_id,
    taskId: row.task_id,
    toolCallId: row.tool_call_id,
    runId: row.run_id ?? undefined,
    toolName: row.tool_name,
    argsJson: row.args_json,
    status: row.status,
    resultJson: row.result_json ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
