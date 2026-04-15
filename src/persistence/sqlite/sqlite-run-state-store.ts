import type { Database } from "bun:sqlite";
import type { ContinuationEnvelope } from "../../harness/core/run-loop/continuation";
import type { ApprovalSuspension } from "../../harness/core/run-loop/approval-suspension";
import type { RunLoopState } from "../../harness/core/run-loop/step-types";
import type { RunStateStorePort } from "../ports/run-state-store";
import { closeSqliteHandle, resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

type RunLoopStateRow = {
  run_id: string;
  thread_id: string;
  state_json: string;
};

type RunSuspensionRow = {
  suspension_id: string;
  thread_id: string;
  payload_json: string;
};

type RunContinuationRow = {
  continuation_id: string;
  payload_json: string;
};

/** SQLite run-state store：保存 run-loop state / suspension / continuation。 */
export class SqliteRunStateStore implements RunStateStorePort {
  private readonly db: Database;
  private readonly owned: boolean;

  constructor(path: string | Database) {
    const connection = resolveSqlite(path);
    this.db = connection.db;
    this.owned = connection.owned;
    migrateSqlite(this.db);
  }

  async loadLatestByThread(threadId: string): Promise<RunLoopState | undefined> {
    const row = this.db
      .query<RunLoopStateRow, [string]>(
        `SELECT run_id, thread_id, state_json
         FROM run_loop_states
         WHERE thread_id = ?
         ORDER BY updated_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(threadId);

    return row ? JSON.parse(row.state_json) as RunLoopState : undefined;
  }

  async loadByRun(runId: string): Promise<RunLoopState | undefined> {
    const row = this.db
      .query<RunLoopStateRow, [string]>(
        `SELECT run_id, thread_id, state_json
         FROM run_loop_states
         WHERE run_id = ?`,
      )
      .get(runId);

    return row ? JSON.parse(row.state_json) as RunLoopState : undefined;
  }

  async saveState(state: RunLoopState): Promise<void> {
    if (!state.runId || !state.threadId) {
      throw new Error("run-loop state requires runId and threadId");
    }

    this.db.run(
      `INSERT INTO run_loop_states (run_id, thread_id, task_id, step, state_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         task_id = excluded.task_id,
         step = excluded.step,
         state_json = excluded.state_json,
         updated_at = excluded.updated_at`,
      [
        state.runId,
        state.threadId,
        state.taskId ?? null,
        state.nextStep,
        JSON.stringify(state),
        new Date().toISOString(),
      ],
    );
  }

  async saveSuspension(suspension: ApprovalSuspension): Promise<void> {
    this.db.run(
      `INSERT INTO run_suspensions (
         suspension_id, run_id, thread_id, task_id, approval_request_id, reason_kind, resume_step, payload_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(suspension_id) DO UPDATE SET
         run_id = excluded.run_id,
         thread_id = excluded.thread_id,
         task_id = excluded.task_id,
         approval_request_id = excluded.approval_request_id,
         reason_kind = excluded.reason_kind,
         resume_step = excluded.resume_step,
         payload_json = excluded.payload_json,
         created_at = excluded.created_at`,
      [
        suspension.suspensionId,
        suspension.runId,
        suspension.threadId,
        suspension.taskId,
        suspension.approvalRequestId,
        suspension.reasonKind,
        suspension.resumeStep,
        JSON.stringify(suspension),
        suspension.createdAt,
      ],
    );
  }

  async saveContinuation(continuation: ContinuationEnvelope): Promise<void> {
    this.db.run(
      `INSERT INTO run_continuations (continuation_id, thread_id, run_id, kind, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(continuation_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         run_id = excluded.run_id,
         kind = excluded.kind,
         payload_json = excluded.payload_json,
         created_at = excluded.created_at`,
      [
        continuation.continuationId,
        "threadId" in continuation ? (continuation as { threadId?: string }).threadId ?? null : null,
        "runId" in continuation ? (continuation as { runId?: string }).runId ?? null : null,
        continuation.kind,
        JSON.stringify(continuation),
        new Date().toISOString(),
      ],
    );
  }

  async consumeContinuation(continuationId: string): Promise<ContinuationEnvelope | undefined> {
    const row = this.db
      .query<RunContinuationRow, [string]>(
        `SELECT continuation_id, payload_json
         FROM run_continuations
         WHERE continuation_id = ?`,
      )
      .get(continuationId);

    if (!row) {
      return undefined;
    }

    this.db.run("DELETE FROM run_continuations WHERE continuation_id = ?", [continuationId]);
    return JSON.parse(row.payload_json) as ContinuationEnvelope;
  }

  async listSuspensionsByThread(threadId: string): Promise<ApprovalSuspension[]> {
    const rows = this.db
      .query<RunSuspensionRow, [string]>(
        `SELECT suspension_id, thread_id, payload_json
         FROM run_suspensions
         WHERE thread_id = ?
         ORDER BY rowid DESC`,
      )
      .all(threadId);

    return rows.map((row) => JSON.parse(row.payload_json) as ApprovalSuspension);
  }

  async resetThreadState(threadId: string): Promise<void> {
    this.db.run("DELETE FROM run_suspensions WHERE thread_id = ?", [threadId]);
    this.db.run("DELETE FROM run_loop_states WHERE thread_id = ?", [threadId]);
    this.db.run("DELETE FROM run_continuations WHERE thread_id = ?", [threadId]);
  }

  async deleteRunState(runId: string): Promise<void> {
    this.db.run("DELETE FROM run_suspensions WHERE run_id = ?", [runId]);
    this.db.run("DELETE FROM run_loop_states WHERE run_id = ?", [runId]);
    this.db.run("DELETE FROM run_continuations WHERE run_id = ?", [runId]);
  }

  async close(): Promise<void> {
    if (this.owned) {
      closeSqliteHandle(this.db);
    }
  }
}
