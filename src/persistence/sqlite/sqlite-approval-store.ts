import type { Database } from "bun:sqlite";
import type { ApprovalRequest } from "../../domain/approval";
import { createSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

type ApprovalRow = {
  approval_request_id: string;
  thread_id: string;
  task_id: string;
  tool_call_id: string;
  summary: string;
  risk: string;
  status: ApprovalRequest["status"];
};

export class SqliteApprovalStore {
  private readonly db: Database;

  constructor(path: string | Database) {
    this.db = typeof path === "string" ? createSqlite(path) : path;
    migrateSqlite(this.db);
  }

  async save(request: ApprovalRequest): Promise<void> {
    this.db.run(
      `INSERT INTO approvals (approval_request_id, thread_id, task_id, tool_call_id, summary, risk, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(approval_request_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         task_id = excluded.task_id,
         tool_call_id = excluded.tool_call_id,
         summary = excluded.summary,
         risk = excluded.risk,
         status = excluded.status`,
      [
        request.approvalRequestId,
        request.threadId,
        request.taskId,
        request.toolCallId,
        request.summary,
        request.risk,
        request.status,
      ],
    );
  }

  async get(approvalRequestId: string): Promise<ApprovalRequest | undefined> {
    const row = this.db
      .query<ApprovalRow, [string]>(
        `SELECT approval_request_id, thread_id, task_id, tool_call_id, summary, risk, status
         FROM approvals
         WHERE approval_request_id = ?`,
      )
      .get(approvalRequestId);

    return row
      ? {
          approvalRequestId: row.approval_request_id,
          threadId: row.thread_id,
          taskId: row.task_id,
          toolCallId: row.tool_call_id,
          summary: row.summary,
          risk: row.risk,
          status: row.status,
        }
      : undefined;
  }

  async listPendingByThread(threadId: string): Promise<ApprovalRequest[]> {
    const rows = this.db
      .query<ApprovalRow, [string]>(
        `SELECT approval_request_id, thread_id, task_id, tool_call_id, summary, risk, status
         FROM approvals
         WHERE thread_id = ? AND status = 'pending'
         ORDER BY rowid ASC`,
      )
      .all(threadId);

    return rows.map((row) => ({
      approvalRequestId: row.approval_request_id,
      threadId: row.thread_id,
      taskId: row.task_id,
      toolCallId: row.tool_call_id,
      summary: row.summary,
      risk: row.risk,
      status: row.status,
    }));
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
