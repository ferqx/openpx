import type { Database } from "bun:sqlite";
import type { ApprovalRequest, ApprovalToolRequest } from "../../domain/approval";
import { resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

type ApprovalRow = {
  approval_request_id: string;
  thread_id: string;
  run_id: string | null;
  task_id: string;
  tool_call_id: string;
  request_json: string | null;
  summary: string;
  risk: string;
  status: ApprovalRequest["status"];
};

export class SqliteApprovalStore {
  private readonly db: Database;
  private readonly owned: boolean;

  constructor(path: string | Database) {
    const connection = resolveSqlite(path);
    this.db = connection.db;
    this.owned = connection.owned;
    migrateSqlite(this.db);
  }

  async save(request: ApprovalRequest): Promise<void> {
    this.db.run(
      `INSERT INTO approvals (approval_request_id, thread_id, run_id, task_id, tool_call_id, request_json, summary, risk, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(approval_request_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         run_id = excluded.run_id,
         task_id = excluded.task_id,
         tool_call_id = excluded.tool_call_id,
         request_json = excluded.request_json,
         summary = excluded.summary,
         risk = excluded.risk,
         status = excluded.status`,
      [
        request.approvalRequestId,
        request.threadId,
        request.runId,
        request.taskId,
        request.toolCallId,
        JSON.stringify(request.toolRequest),
        request.summary,
        request.risk,
        request.status,
      ],
    );
  }

  async get(approvalRequestId: string): Promise<ApprovalRequest | undefined> {
    const row = this.db
      .query<ApprovalRow, [string]>(
        `SELECT approval_request_id, thread_id, run_id, task_id, tool_call_id, request_json, summary, risk, status
         FROM approvals
         WHERE approval_request_id = ?`,
      )
      .get(approvalRequestId);

    return row ? mapApprovalRow(row) : undefined;
  }

  async listPendingByThread(threadId: string): Promise<ApprovalRequest[]> {
    const rows = this.db
      .query<ApprovalRow, [string]>(
        `SELECT approval_request_id, thread_id, run_id, task_id, tool_call_id, request_json, summary, risk, status
         FROM approvals
         WHERE thread_id = ? AND status = 'pending'
         ORDER BY rowid ASC`,
      )
      .all(threadId);

    return rows.map(mapApprovalRow);
  }

  async listByThread(threadId: string): Promise<ApprovalRequest[]> {
    const rows = this.db
      .query<ApprovalRow, [string]>(
        `SELECT approval_request_id, thread_id, run_id, task_id, tool_call_id, request_json, summary, risk, status
         FROM approvals
         WHERE thread_id = ?
         ORDER BY rowid ASC`,
      )
      .all(threadId);

    return rows.map(mapApprovalRow);
  }

  async close(): Promise<void> {
    if (this.owned) {
      this.db.close();
    }
  }
}

function mapApprovalRow(row: ApprovalRow): ApprovalRequest {
  return {
    approvalRequestId: row.approval_request_id,
    threadId: row.thread_id,
    runId: row.run_id ?? row.task_id,
    taskId: row.task_id,
    toolCallId: row.tool_call_id,
    toolRequest: (JSON.parse(row.request_json ?? "{}") as ApprovalToolRequest),
    summary: row.summary,
    risk: row.risk,
    status: row.status,
  };
}
