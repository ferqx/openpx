import type { Database } from "bun:sqlite";
import type { ContinuationEnvelope } from "../../harness/core/run-loop/continuation";
import type { ApprovalSuspension } from "../../harness/core/run-loop/approval-suspension";
import {
  RUN_LOOP_ENGINE_VERSION,
  RUN_LOOP_STATE_VERSION,
  type RunLoopState,
} from "../../harness/core/run-loop/step-types";
import type { RunStateStorePort } from "../ports/run-state-store";
import { closeSqliteHandle, resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

type RunLoopStateRow = {
  run_id: string;
  thread_id: string;
  state_version: number;
  engine_version: string;
  state_json: string;
};

type RunSuspensionRow = {
  payload_json: string;
};

type RunContinuationRow = {
  payload_json: string;
};

type CountRow = {
  count: number;
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

  private normalizeState(row: RunLoopStateRow | undefined): RunLoopState | undefined {
    if (!row) {
      return undefined;
    }

    const parsed = JSON.parse(row.state_json) as Partial<RunLoopState>;
    return {
      stateVersion: parsed.stateVersion ?? row.state_version ?? RUN_LOOP_STATE_VERSION,
      engineVersion: parsed.engineVersion ?? row.engine_version ?? RUN_LOOP_ENGINE_VERSION,
      ...parsed,
    } as RunLoopState;
  }

  private normalizeSuspension(row: RunSuspensionRow | undefined): ApprovalSuspension | undefined {
    if (!row) {
      return undefined;
    }

    const parsed = JSON.parse(row.payload_json) as ApprovalSuspension;
    return {
      ...parsed,
      status: parsed.status ?? "active",
    };
  }

  private normalizeContinuation(row: RunContinuationRow | undefined): ContinuationEnvelope | undefined {
    if (!row) {
      return undefined;
    }

    const parsed = JSON.parse(row.payload_json) as ContinuationEnvelope;
    return {
      ...parsed,
      status: parsed.status ?? "created",
    };
  }

  async loadLatestByThread(threadId: string): Promise<RunLoopState | undefined> {
    const row = this.db
      .query<RunLoopStateRow, [string]>(
        `SELECT run_id, thread_id, state_version, engine_version, state_json
         FROM run_loop_states
         WHERE thread_id = ?
         ORDER BY updated_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(threadId);

    return this.normalizeState(row ?? undefined);
  }

  async loadByRun(runId: string): Promise<RunLoopState | undefined> {
    const row = this.db
      .query<RunLoopStateRow, [string]>(
        `SELECT run_id, thread_id, state_version, engine_version, state_json
         FROM run_loop_states
         WHERE run_id = ?`,
      )
      .get(runId);

    return this.normalizeState(row ?? undefined);
  }

  async loadActiveSuspensionByRun(runId: string): Promise<ApprovalSuspension | undefined> {
    const row = this.db
      .query<RunSuspensionRow, [string]>(
        `SELECT payload_json
         FROM run_suspensions
         WHERE run_id = ? AND status = 'active'
         ORDER BY created_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(runId);

    return this.normalizeSuspension(row ?? undefined);
  }

  async loadContinuation(continuationId: string): Promise<ContinuationEnvelope | undefined> {
    const row = this.db
      .query<RunContinuationRow, [string]>(
        `SELECT payload_json
         FROM run_continuations
         WHERE continuation_id = ?`,
      )
      .get(continuationId);

    return this.normalizeContinuation(row ?? undefined);
  }

  async saveState(state: RunLoopState): Promise<void> {
    if (!state.runId || !state.threadId) {
      throw new Error("run-loop state requires runId and threadId");
    }

    const normalizedState: RunLoopState = {
      ...state,
      stateVersion: state.stateVersion ?? RUN_LOOP_STATE_VERSION,
      engineVersion: state.engineVersion ?? RUN_LOOP_ENGINE_VERSION,
    };
    const runId = normalizedState.runId;
    const threadId = normalizedState.threadId;
    if (!runId || !threadId) {
      throw new Error("run-loop state requires normalized runId and threadId");
    }

    this.db.run(
      `INSERT INTO run_loop_states (run_id, thread_id, task_id, step, state_version, engine_version, state_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         task_id = excluded.task_id,
         step = excluded.step,
         state_version = excluded.state_version,
         engine_version = excluded.engine_version,
         state_json = excluded.state_json,
         updated_at = excluded.updated_at`,
      [
        runId,
        threadId,
        normalizedState.taskId ?? null,
        normalizedState.nextStep,
        normalizedState.stateVersion,
        normalizedState.engineVersion,
        JSON.stringify(normalizedState),
        new Date().toISOString(),
      ],
    );
  }

  async saveSuspension(suspension: ApprovalSuspension): Promise<void> {
    const normalizedSuspension: ApprovalSuspension = {
      ...suspension,
      status: suspension.status ?? "active",
    };

    this.db.run(
      `INSERT INTO run_suspensions (
         suspension_id, run_id, thread_id, task_id, approval_request_id, reason_kind, resume_step, status,
         payload_json, created_at, resumed_at, resolved_at, resolved_by_continuation_id, invalidated_at, invalidation_reason
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(suspension_id) DO UPDATE SET
         run_id = excluded.run_id,
         thread_id = excluded.thread_id,
         task_id = excluded.task_id,
         approval_request_id = excluded.approval_request_id,
         reason_kind = excluded.reason_kind,
         resume_step = excluded.resume_step,
         status = excluded.status,
         payload_json = excluded.payload_json,
         created_at = excluded.created_at,
         resumed_at = excluded.resumed_at,
         resolved_at = excluded.resolved_at,
         resolved_by_continuation_id = excluded.resolved_by_continuation_id,
         invalidated_at = excluded.invalidated_at,
         invalidation_reason = excluded.invalidation_reason`,
      [
        normalizedSuspension.suspensionId,
        normalizedSuspension.runId,
        normalizedSuspension.threadId,
        normalizedSuspension.taskId,
        normalizedSuspension.approvalRequestId,
        normalizedSuspension.reasonKind,
        normalizedSuspension.resumeStep,
        normalizedSuspension.status,
        JSON.stringify(normalizedSuspension),
        normalizedSuspension.createdAt,
        normalizedSuspension.resolvedAt ?? null,
        normalizedSuspension.resolvedAt ?? null,
        normalizedSuspension.resolvedByContinuationId ?? null,
        normalizedSuspension.invalidatedAt ?? null,
        normalizedSuspension.invalidationReason ?? null,
      ],
    );
  }

  async saveContinuation(continuation: ContinuationEnvelope): Promise<void> {
    if (!continuation.threadId || !continuation.runId) {
      throw new Error("continuation requires runId and threadId");
    }

    const normalizedContinuation: ContinuationEnvelope = {
      ...continuation,
      status: continuation.status ?? "created",
    };
    const status = normalizedContinuation.status ?? "created";

    this.db.run(
      `INSERT INTO run_continuations (
         continuation_id, thread_id, run_id, kind, status, payload_json, created_at, consumed_at, invalidated_at, invalidation_reason
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(continuation_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         run_id = excluded.run_id,
         kind = excluded.kind,
         status = excluded.status,
         payload_json = excluded.payload_json,
         created_at = excluded.created_at,
         consumed_at = excluded.consumed_at,
         invalidated_at = excluded.invalidated_at,
         invalidation_reason = excluded.invalidation_reason`,
      [
        normalizedContinuation.continuationId,
        normalizedContinuation.threadId,
        normalizedContinuation.runId,
        normalizedContinuation.kind,
        status,
        JSON.stringify(normalizedContinuation),
        new Date().toISOString(),
        normalizedContinuation.consumedAt ?? null,
        normalizedContinuation.invalidatedAt ?? null,
        normalizedContinuation.invalidationReason ?? null,
      ],
    );
  }

  async consumeContinuation(continuationId: string): Promise<ContinuationEnvelope | undefined> {
    const continuation = await this.loadContinuation(continuationId);
    if (!continuation || continuation.status !== "created") {
      return undefined;
    }

    const consumedAt = new Date().toISOString();
    const next: ContinuationEnvelope = {
      ...continuation,
      status: "consumed",
      consumedAt,
    };

    const result = this.db.run(
      `UPDATE run_continuations
       SET status = ?, payload_json = ?, consumed_at = ?, invalidated_at = ?, invalidation_reason = ?
       WHERE continuation_id = ? AND status = 'created'`,
      [
        "consumed",
        JSON.stringify(next),
        consumedAt,
        null,
        null,
        continuationId,
      ],
    );

    if (result.changes === 0) {
      return undefined;
    }

    return next;
  }

  async resolveSuspension(input: { suspensionId: string; continuationId: string }): Promise<boolean> {
    const row = this.db
      .query<RunSuspensionRow, [string]>(
        `SELECT payload_json
         FROM run_suspensions
         WHERE suspension_id = ?`,
      )
      .get(input.suspensionId);

    const suspension = this.normalizeSuspension(row ?? undefined);
    if (!suspension || suspension.status !== "active") {
      return false;
    }

    const resolvedAt = new Date().toISOString();
    const next: ApprovalSuspension = {
      ...suspension,
      status: "resolved",
      resolvedAt,
      resolvedByContinuationId: input.continuationId,
    };

    const result = this.db.run(
      `UPDATE run_suspensions
       SET status = ?, payload_json = ?, resumed_at = ?, resolved_at = ?, resolved_by_continuation_id = ?
       WHERE suspension_id = ? AND status = 'active'`,
      [
        "resolved",
        JSON.stringify(next),
        resolvedAt,
        resolvedAt,
        input.continuationId,
        input.suspensionId,
      ],
    );

    return result.changes > 0;
  }

  async invalidateSuspension(input: { suspensionId: string; reason: string }): Promise<boolean> {
    const row = this.db
      .query<RunSuspensionRow, [string]>(
        `SELECT payload_json
         FROM run_suspensions
         WHERE suspension_id = ?`,
      )
      .get(input.suspensionId);

    const suspension = this.normalizeSuspension(row ?? undefined);
    if (!suspension || suspension.status !== "active") {
      return false;
    }

    const invalidatedAt = new Date().toISOString();
    const next: ApprovalSuspension = {
      ...suspension,
      status: "invalidated",
      invalidatedAt,
      invalidationReason: input.reason,
    };

    const result = this.db.run(
      `UPDATE run_suspensions
       SET status = ?, payload_json = ?, invalidated_at = ?, invalidation_reason = ?
       WHERE suspension_id = ? AND status = 'active'`,
      [
        "invalidated",
        JSON.stringify(next),
        invalidatedAt,
        input.reason,
        input.suspensionId,
      ],
    );

    return result.changes > 0;
  }

  async invalidateContinuation(input: { continuationId: string; reason: string }): Promise<boolean> {
    const continuation = await this.loadContinuation(input.continuationId);
    if (!continuation || continuation.status !== "created") {
      return false;
    }

    const invalidatedAt = new Date().toISOString();
    const next: ContinuationEnvelope = {
      ...continuation,
      status: "invalidated",
      invalidatedAt,
      invalidationReason: input.reason,
    };

    const result = this.db.run(
      `UPDATE run_continuations
       SET status = ?, payload_json = ?, invalidated_at = ?, invalidation_reason = ?
       WHERE continuation_id = ? AND status = 'created'`,
      [
        "invalidated",
        JSON.stringify(next),
        invalidatedAt,
        input.reason,
        input.continuationId,
      ],
    );

    return result.changes > 0;
  }

  async listSuspensionsByThread(threadId: string): Promise<ApprovalSuspension[]> {
    const rows = this.db
      .query<RunSuspensionRow, [string]>(
        `SELECT payload_json
         FROM run_suspensions
         WHERE thread_id = ?
         ORDER BY rowid DESC`,
      )
      .all(threadId);

    return rows
      .map((row) => this.normalizeSuspension(row))
      .filter((value): value is ApprovalSuspension => value !== undefined);
  }

  async resetThreadState(threadId: string): Promise<void> {
    this.db.run("DELETE FROM run_suspensions WHERE thread_id = ?", [threadId]);
    this.db.run("DELETE FROM run_loop_states WHERE thread_id = ?", [threadId]);
    this.db.run("DELETE FROM run_continuations WHERE thread_id = ?", [threadId]);
  }

  async deleteActiveRunState(runId: string): Promise<void> {
    this.db.run("DELETE FROM run_loop_states WHERE run_id = ?", [runId]);
  }

  async deleteExpiredAuditRecords(olderThanIso: string): Promise<{ suspensions: number; continuations: number }> {
    const suspensions = this.db.run(
      `DELETE FROM run_suspensions
       WHERE status IN ('resolved', 'invalidated')
         AND COALESCE(resolved_at, invalidated_at, created_at) < ?`,
      [olderThanIso],
    ).changes;
    const continuations = this.db.run(
      `DELETE FROM run_continuations
       WHERE status IN ('consumed', 'invalidated')
         AND COALESCE(consumed_at, invalidated_at, created_at) < ?`,
      [olderThanIso],
    ).changes;

    return { suspensions, continuations };
  }

  async close(): Promise<void> {
    if (this.owned) {
      closeSqliteHandle(this.db);
    }
  }
}
