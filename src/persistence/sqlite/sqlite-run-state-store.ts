import type { Database } from "bun:sqlite";
import {
  resolveSuspensionAfterApproval,
  resolveSuspensionAfterPlanDecision,
} from "../../harness/core/run-loop/approval-suspension";
import {
  isApprovalResolutionContinuation,
  isPlanDecisionContinuation,
  type ApprovalResolutionContinuation,
  type ContinuationEnvelope,
  type PlanDecisionContinuation,
} from "../../harness/core/run-loop/continuation";
import type { RunSuspension } from "../../harness/core/run-loop/approval-suspension";
import {
  RUN_LOOP_ENGINE_VERSION,
  RUN_LOOP_STATE_VERSION,
  type RunLoopState,
} from "../../harness/core/run-loop/step-types";
import type {
  ApprovalContinuationTransactionResult,
  PlanDecisionContinuationTransactionResult,
  RunStateStorePort,
} from "../ports/run-state-store";
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
  suspension_id: string;
  run_id: string;
  thread_id: string;
  task_id: string;
  approval_request_id: string | null;
  status: RunSuspension["status"];
  payload_json: string;
};

type RunContinuationRow = {
  continuation_id: string;
  thread_id: string | null;
  run_id: string | null;
  task_id: string | null;
  approval_request_id: string | null;
  kind: string;
  status: NonNullable<ContinuationEnvelope["status"]>;
  payload_json: string;
};

type ApprovalRow = {
  status: "pending" | "approved" | "rejected" | "cancelled";
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
    this.backfillContinuationOwnershipColumns();
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

  private normalizeSuspension(row: RunSuspensionRow | undefined): RunSuspension | undefined {
    if (!row) {
      return undefined;
    }

    const parsed = JSON.parse(row.payload_json) as RunSuspension;
    return {
      ...parsed,
      suspensionId: parsed.suspensionId ?? row.suspension_id,
      runId: parsed.runId ?? row.run_id,
      threadId: parsed.threadId ?? row.thread_id,
      taskId: parsed.taskId ?? row.task_id,
      ...(parsed.reasonKind === "waiting_approval"
        ? { approvalRequestId: parsed.approvalRequestId ?? row.approval_request_id ?? "" }
        : {}),
      status: parsed.status ?? row.status ?? "active",
    } as RunSuspension;
  }

  private normalizeContinuation(row: RunContinuationRow | undefined): ContinuationEnvelope | undefined {
    if (!row) {
      return undefined;
    }

    const parsed = JSON.parse(row.payload_json) as Partial<ContinuationEnvelope>;
    const parsedOwnership = parsed as Partial<ContinuationEnvelope> & {
      reason?: string;
      approvalRequestId?: string;
    };
    const kind = (parsed.kind ?? row.kind) as ContinuationEnvelope["kind"];
    const base = {
      continuationId: parsed.continuationId ?? row.continuation_id,
      threadId: parsed.threadId ?? row.thread_id ?? "",
      runId: parsed.runId ?? row.run_id ?? "",
      taskId: parsed.taskId ?? row.task_id ?? undefined,
      kind,
      input: parsed.input,
      reason: parsedOwnership.reason,
      step: parsed.step,
      status: parsed.status ?? row.status ?? "created",
      consumedAt: parsed.consumedAt,
      invalidatedAt: parsed.invalidatedAt,
      invalidationReason: parsed.invalidationReason,
      approvalRequestId: parsedOwnership.approvalRequestId ?? row.approval_request_id ?? undefined,
    };

    if (kind === "approval_resolution") {
      const parsedApproval = parsed as Partial<ApprovalResolutionContinuation>;
      return {
        ...base,
        kind,
        taskId: base.taskId ?? "",
        approvalRequestId: base.approvalRequestId ?? "",
        decision: parsedApproval.decision ?? "approved",
      };
    }

    if (kind === "plan_decision") {
      const parsedDecision = parsed as Partial<PlanDecisionContinuation>;
      return {
        ...base,
        kind,
        taskId: base.taskId ?? "",
        optionId: parsedDecision.optionId ?? "",
        optionLabel: parsedDecision.optionLabel ?? "",
        input: parsedDecision.input ?? base.input ?? "",
        step: parsedDecision.step,
      };
    }

    return {
      ...base,
      kind,
    };
  }

  private normalizeContinuationForStorage(continuation: ContinuationEnvelope): ContinuationEnvelope {
    if (!continuation.threadId || !continuation.runId) {
      throw new Error("continuation requires runId and threadId");
    }
    if (isApprovalResolutionContinuation(continuation) && (!continuation.taskId || !continuation.approvalRequestId)) {
      throw new Error("approval_resolution continuation requires taskId and approvalRequestId");
    }
    if (isPlanDecisionContinuation(continuation) && (!continuation.taskId || !continuation.optionId || !continuation.input)) {
      throw new Error("plan_decision continuation requires taskId, optionId and input");
    }

    return {
      ...continuation,
      status: continuation.status ?? "created",
    };
  }

  private loadStateRow(runId: string): RunLoopStateRow | undefined {
    return this.db
      .query<RunLoopStateRow, [string]>(
        `SELECT run_id, thread_id, state_version, engine_version, state_json
         FROM run_loop_states
         WHERE run_id = ?`,
      )
      .get(runId) ?? undefined;
  }

  private loadActiveSuspensionRow(runId: string): RunSuspensionRow | undefined {
    return this.db
      .query<RunSuspensionRow, [string]>(
        `SELECT suspension_id, run_id, thread_id, task_id, approval_request_id, status, payload_json
         FROM run_suspensions
         WHERE run_id = ? AND status = 'active'
         ORDER BY created_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(runId) ?? undefined;
  }

  private loadLatestSuspensionRow(runId: string): RunSuspensionRow | undefined {
    return this.db
      .query<RunSuspensionRow, [string]>(
        `SELECT suspension_id, run_id, thread_id, task_id, approval_request_id, status, payload_json
         FROM run_suspensions
         WHERE run_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(runId) ?? undefined;
  }

  private loadContinuationRow(continuationId: string): RunContinuationRow | undefined {
    return this.db
      .query<RunContinuationRow, [string]>(
        `SELECT continuation_id, thread_id, run_id, task_id, approval_request_id, kind, status, payload_json
         FROM run_continuations
         WHERE continuation_id = ?`,
      )
      .get(continuationId) ?? undefined;
  }

  private writeState(state: RunLoopState): void {
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

  private writeSuspension(suspension: RunSuspension): void {
    const normalizedSuspension: RunSuspension = {
      ...suspension,
      status: suspension.status ?? "active",
    };
    const approvalRequestId =
      normalizedSuspension.reasonKind === "waiting_approval"
        ? normalizedSuspension.approvalRequestId
        : null;

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
        approvalRequestId,
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

  private writeContinuation(continuation: ContinuationEnvelope): void {
    const normalizedContinuation = this.normalizeContinuationForStorage(continuation);
    const approvalRequestId = isApprovalResolutionContinuation(normalizedContinuation)
      ? normalizedContinuation.approvalRequestId
      : null;

    this.db.run(
      `INSERT INTO run_continuations (
         continuation_id, thread_id, run_id, task_id, approval_request_id, kind, status,
         payload_json, created_at, consumed_at, invalidated_at, invalidation_reason
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(continuation_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         run_id = excluded.run_id,
         task_id = excluded.task_id,
         approval_request_id = excluded.approval_request_id,
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
        normalizedContinuation.taskId ?? null,
        approvalRequestId,
        normalizedContinuation.kind,
        normalizedContinuation.status ?? "created",
        JSON.stringify(normalizedContinuation),
        new Date().toISOString(),
        normalizedContinuation.consumedAt ?? null,
        normalizedContinuation.invalidatedAt ?? null,
        normalizedContinuation.invalidationReason ?? null,
      ],
    );
  }

  private consumeContinuationSync(continuationId: string): ContinuationEnvelope | undefined {
    const continuation = this.normalizeContinuation(this.loadContinuationRow(continuationId));
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

  private resolveSuspensionSync(input: { suspensionId: string; continuationId: string }): RunSuspension | undefined {
    const suspension = this.normalizeSuspension(
      this.db
        .query<RunSuspensionRow, [string]>(
          `SELECT suspension_id, run_id, thread_id, task_id, approval_request_id, status, payload_json
           FROM run_suspensions
           WHERE suspension_id = ?`,
        )
        .get(input.suspensionId) ?? undefined,
    );
    if (!suspension || suspension.status !== "active") {
      return undefined;
    }

    const resolvedAt = new Date().toISOString();
    const next: RunSuspension = {
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

    return result.changes > 0 ? next : undefined;
  }

  private invalidateSuspensionSync(input: { suspensionId: string; reason: string }): RunSuspension | undefined {
    const suspension = this.normalizeSuspension(
      this.db
        .query<RunSuspensionRow, [string]>(
          `SELECT suspension_id, run_id, thread_id, task_id, approval_request_id, status, payload_json
           FROM run_suspensions
           WHERE suspension_id = ?`,
        )
        .get(input.suspensionId) ?? undefined,
    );
    if (!suspension || suspension.status !== "active") {
      return undefined;
    }

    const invalidatedAt = new Date().toISOString();
    const next: RunSuspension = {
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

    return result.changes > 0 ? next : undefined;
  }

  private invalidateContinuationSync(input: { continuationId: string; reason: string }): ContinuationEnvelope | undefined {
    const continuation = this.normalizeContinuation(this.loadContinuationRow(input.continuationId));
    if (!continuation || continuation.status !== "created") {
      return undefined;
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

    return result.changes > 0 ? next : undefined;
  }

  private buildSyntheticState(input: {
    continuation: ApprovalResolutionContinuation | PlanDecisionContinuation;
    existingContinuation?: ContinuationEnvelope;
    existingSuspension?: RunSuspension;
  }): RunLoopState {
    const terminalStep =
      input.existingContinuation?.status === "consumed"
      || input.existingSuspension?.status === "resolved"
        ? "done"
        : input.continuation.kind === "plan_decision"
          ? "waiting_plan_decision"
          : "waiting_approval";

    return {
      stateVersion: RUN_LOOP_STATE_VERSION,
      engineVersion: RUN_LOOP_ENGINE_VERSION,
      threadId: input.continuation.threadId,
      runId: input.continuation.runId,
      taskId: input.continuation.taskId,
      input: input.continuation.input ?? (input.continuation.kind === "approval_resolution" ? input.continuation.reason : undefined) ?? "",
      nextStep: terminalStep,
      artifacts: [],
      latestArtifacts: [],
    };
  }

  private backfillContinuationOwnershipColumns(): void {
    const rows = this.db
      .query<{ continuation_id: string; payload_json: string; task_id: string | null; approval_request_id: string | null }, []>(
        `SELECT continuation_id, payload_json, task_id, approval_request_id
         FROM run_continuations
         WHERE task_id IS NULL OR approval_request_id IS NULL`,
      )
      .all();

    for (const row of rows) {
      const parsed = JSON.parse(row.payload_json) as Partial<ContinuationEnvelope>;
      this.db.run(
        `UPDATE run_continuations
         SET task_id = COALESCE(task_id, ?),
             approval_request_id = COALESCE(approval_request_id, ?)
         WHERE continuation_id = ?`,
        [
          parsed.taskId ?? null,
          (parsed as Partial<ApprovalResolutionContinuation>).approvalRequestId ?? null,
          row.continuation_id,
        ],
      );
    }
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
    return this.normalizeState(this.loadStateRow(runId));
  }

  async loadActiveSuspensionByRun(runId: string): Promise<RunSuspension | undefined> {
    return this.normalizeSuspension(this.loadActiveSuspensionRow(runId));
  }

  async loadContinuation(continuationId: string): Promise<ContinuationEnvelope | undefined> {
    return this.normalizeContinuation(this.loadContinuationRow(continuationId));
  }

  async saveState(state: RunLoopState): Promise<void> {
    this.writeState(state);
  }

  async saveSuspension(suspension: RunSuspension): Promise<void> {
    this.writeSuspension(suspension);
  }

  async saveContinuation(continuation: ContinuationEnvelope): Promise<void> {
    this.writeContinuation(continuation);
  }

  async consumeContinuation(continuationId: string): Promise<ContinuationEnvelope | undefined> {
    return this.consumeContinuationSync(continuationId);
  }

  async resolveSuspension(input: { suspensionId: string; continuationId: string }): Promise<boolean> {
    return this.resolveSuspensionSync(input) !== undefined;
  }

  async invalidateSuspension(input: { suspensionId: string; reason: string }): Promise<boolean> {
    return this.invalidateSuspensionSync(input) !== undefined;
  }

  async invalidateContinuation(input: { continuationId: string; reason: string }): Promise<boolean> {
    return this.invalidateContinuationSync(input) !== undefined;
  }

  async applyApprovalContinuation(input: {
    continuation: ApprovalResolutionContinuation;
    expectedStateVersion: number;
    expectedEngineVersion: string;
  }): Promise<ApprovalContinuationTransactionResult> {
    return this.db.transaction((payload: typeof input): ApprovalContinuationTransactionResult => {
      const existingContinuation = this.normalizeContinuation(this.loadContinuationRow(payload.continuation.continuationId));
      const latestSuspension = this.normalizeSuspension(this.loadLatestSuspensionRow(payload.continuation.runId));
      const state =
        this.normalizeState(this.loadStateRow(payload.continuation.runId))
        ?? this.buildSyntheticState({
          continuation: payload.continuation,
          existingContinuation,
          existingSuspension: latestSuspension,
        });

      if (existingContinuation?.status === "consumed") {
        return {
          disposition: "already_consumed",
          state,
          continuation: existingContinuation,
          suspension: latestSuspension,
        };
      }
      if (existingContinuation?.status === "invalidated") {
        return {
          disposition: "invalidated",
          state,
          continuation: existingContinuation,
          suspension: latestSuspension,
        };
      }

      if (!existingContinuation) {
        this.writeContinuation({
          ...payload.continuation,
          status: "created",
        });
      }

      const activeSuspension = this.normalizeSuspension(this.loadActiveSuspensionRow(payload.continuation.runId));
      if (
        state.stateVersion !== payload.expectedStateVersion
        || state.engineVersion !== payload.expectedEngineVersion
      ) {
        const invalidatedContinuation = this.invalidateContinuationSync({
          continuationId: payload.continuation.continuationId,
          reason: "run-loop state version mismatch",
        });
        const invalidatedSuspension = activeSuspension
          ? this.invalidateSuspensionSync({
              suspensionId: activeSuspension.suspensionId,
              reason: "run-loop state version mismatch",
            })
          : latestSuspension;

        return {
          disposition: "not_resumable",
          state,
          continuation: invalidatedContinuation ?? existingContinuation,
          suspension: invalidatedSuspension,
        };
      }

      if (!activeSuspension) {
        const invalidatedContinuation = this.invalidateContinuationSync({
          continuationId: payload.continuation.continuationId,
          reason:
            latestSuspension?.status === "resolved"
              ? "approval already resolved"
              : latestSuspension?.invalidationReason ?? "approval no longer resumable",
        });

        return {
          disposition: latestSuspension?.status === "resolved" ? "already_resolved" : "invalidated",
          state,
          continuation: invalidatedContinuation ?? this.normalizeContinuation(this.loadContinuationRow(payload.continuation.continuationId)),
          suspension: latestSuspension,
        } as ApprovalContinuationTransactionResult;
      }

      if (
        activeSuspension.reasonKind !== "waiting_approval"
        || activeSuspension.threadId !== payload.continuation.threadId
        || activeSuspension.runId !== payload.continuation.runId
        || activeSuspension.approvalRequestId !== payload.continuation.approvalRequestId
      ) {
        const invalidatedContinuation = this.invalidateContinuationSync({
          continuationId: payload.continuation.continuationId,
          reason: "continuation ownership does not match active suspension",
        });
        return {
          disposition: "invalidated",
          state,
          continuation: invalidatedContinuation ?? this.normalizeContinuation(this.loadContinuationRow(payload.continuation.continuationId)),
          suspension: activeSuspension,
        };
      }

      const targetApprovalStatus = payload.continuation.decision === "approved" ? "approved" : "rejected";
      const approval = this.db
        .query<ApprovalRow, [string]>(
          `SELECT status
           FROM approvals
           WHERE approval_request_id = ?`,
        )
        .get(payload.continuation.approvalRequestId);

      if (!approval) {
        const invalidatedContinuation = this.invalidateContinuationSync({
          continuationId: payload.continuation.continuationId,
          reason: "approval request missing",
        });
        const invalidatedSuspension = this.invalidateSuspensionSync({
          suspensionId: activeSuspension.suspensionId,
          reason: "approval request missing",
        });
        return {
          disposition: "invalidated",
          state,
          continuation: invalidatedContinuation ?? this.normalizeContinuation(this.loadContinuationRow(payload.continuation.continuationId)),
          suspension: invalidatedSuspension ?? activeSuspension,
        };
      }

      if (approval.status === "cancelled") {
        const invalidatedContinuation = this.invalidateContinuationSync({
          continuationId: payload.continuation.continuationId,
          reason: "approval request cancelled",
        });
        const invalidatedSuspension = this.invalidateSuspensionSync({
          suspensionId: activeSuspension.suspensionId,
          reason: "approval request cancelled",
        });
        return {
          disposition: "invalidated",
          state,
          continuation: invalidatedContinuation ?? this.normalizeContinuation(this.loadContinuationRow(payload.continuation.continuationId)),
          suspension: invalidatedSuspension ?? activeSuspension,
        };
      }

      if (approval.status === "pending") {
        const updateResult = this.db.run(
          `UPDATE approvals
           SET status = ?
           WHERE approval_request_id = ? AND status = 'pending'`,
          [targetApprovalStatus, payload.continuation.approvalRequestId],
        );

        if (updateResult.changes === 0) {
          const refreshedApproval = this.db
            .query<ApprovalRow, [string]>(
              `SELECT status
               FROM approvals
               WHERE approval_request_id = ?`,
            )
            .get(payload.continuation.approvalRequestId);
          if (!refreshedApproval || refreshedApproval.status === "cancelled") {
            const invalidatedContinuation = this.invalidateContinuationSync({
              continuationId: payload.continuation.continuationId,
              reason: "approval request cancelled",
            });
            return {
              disposition: "invalidated",
              state,
              continuation: invalidatedContinuation ?? this.normalizeContinuation(this.loadContinuationRow(payload.continuation.continuationId)),
              suspension: activeSuspension,
            };
          }
          if (refreshedApproval.status !== targetApprovalStatus) {
            const invalidatedContinuation = this.invalidateContinuationSync({
              continuationId: payload.continuation.continuationId,
              reason: "approval already resolved with a different decision",
            });
            return {
              disposition: "already_resolved",
              state,
              continuation: invalidatedContinuation ?? this.normalizeContinuation(this.loadContinuationRow(payload.continuation.continuationId)),
              suspension: activeSuspension,
            };
          }
        }
      } else if (approval.status !== targetApprovalStatus) {
        const invalidatedContinuation = this.invalidateContinuationSync({
          continuationId: payload.continuation.continuationId,
          reason: "approval already resolved with a different decision",
        });
        return {
          disposition: "already_resolved",
          state,
          continuation: invalidatedContinuation ?? this.normalizeContinuation(this.loadContinuationRow(payload.continuation.continuationId)),
          suspension: activeSuspension,
        };
      }

      const consumedContinuation = this.consumeContinuationSync(payload.continuation.continuationId) as ApprovalResolutionContinuation | undefined;
      if (!consumedContinuation) {
        const currentContinuation = this.normalizeContinuation(this.loadContinuationRow(payload.continuation.continuationId));
        return {
          disposition: currentContinuation?.status === "invalidated" ? "invalidated" : "already_consumed",
          state,
          continuation: currentContinuation,
          suspension: activeSuspension,
        };
      }

      const transitionedSuspension = consumedContinuation.decision === "approved"
        ? this.resolveSuspensionSync({
            suspensionId: activeSuspension.suspensionId,
            continuationId: consumedContinuation.continuationId,
          })
        : this.invalidateSuspensionSync({
            suspensionId: activeSuspension.suspensionId,
            reason: consumedContinuation.reason ?? "approval rejected",
          });

      if (!transitionedSuspension) {
        const currentSuspension = this.normalizeSuspension(this.loadLatestSuspensionRow(payload.continuation.runId));
        return {
          disposition: currentSuspension?.status === "resolved" ? "already_resolved" : "invalidated",
          state,
          continuation: consumedContinuation,
          suspension: currentSuspension,
        };
      }

      const resumed = resolveSuspensionAfterApproval({
        suspension: activeSuspension,
        continuation: consumedContinuation,
        originalInput: state.input,
      });
      const resumedState: RunLoopState = {
        ...state,
        input: resumed.input,
        nextStep: resumed.nextStep,
        pendingApproval: undefined,
        pauseSummary: undefined,
        recommendationReason: undefined,
        approvedApprovalRequestId: resumed.approvedApprovalRequestId,
      };
      this.writeState(resumedState);

      return {
        disposition: "resumed",
        state: resumedState,
        continuation: consumedContinuation,
        suspension: transitionedSuspension,
      };
    })(input);
  }

  async applyPlanDecisionContinuation(input: {
    continuation: PlanDecisionContinuation;
    expectedStateVersion: number;
    expectedEngineVersion: string;
  }): Promise<PlanDecisionContinuationTransactionResult> {
    return this.db.transaction((payload: typeof input): PlanDecisionContinuationTransactionResult => {
      const existingContinuation = this.normalizeContinuation(this.loadContinuationRow(payload.continuation.continuationId));
      const latestSuspension = this.normalizeSuspension(this.loadLatestSuspensionRow(payload.continuation.runId));
      const state =
        this.normalizeState(this.loadStateRow(payload.continuation.runId))
        ?? this.buildSyntheticState({
          continuation: payload.continuation,
          existingContinuation,
          existingSuspension: latestSuspension,
        });

      if (existingContinuation?.status === "consumed") {
        return {
          disposition: "already_consumed",
          state,
          continuation: existingContinuation,
          suspension: latestSuspension,
        };
      }
      if (existingContinuation?.status === "invalidated") {
        return {
          disposition: "invalidated",
          state,
          continuation: existingContinuation,
          suspension: latestSuspension,
        };
      }

      if (!existingContinuation) {
        this.writeContinuation({
          ...payload.continuation,
          status: "created",
        });
      }

      const activeSuspension = this.normalizeSuspension(this.loadActiveSuspensionRow(payload.continuation.runId));
      if (
        state.stateVersion !== payload.expectedStateVersion
        || state.engineVersion !== payload.expectedEngineVersion
      ) {
        const invalidatedContinuation = this.invalidateContinuationSync({
          continuationId: payload.continuation.continuationId,
          reason: "run-loop state version mismatch",
        });
        const invalidatedSuspension = activeSuspension
          ? this.invalidateSuspensionSync({
              suspensionId: activeSuspension.suspensionId,
              reason: "run-loop state version mismatch",
            })
          : latestSuspension;

        return {
          disposition: "not_resumable",
          state,
          continuation: invalidatedContinuation ?? existingContinuation,
          suspension: invalidatedSuspension,
        };
      }

      if (!activeSuspension) {
        const invalidatedContinuation = this.invalidateContinuationSync({
          continuationId: payload.continuation.continuationId,
          reason:
            latestSuspension?.status === "resolved"
              ? "plan decision already resolved"
              : latestSuspension?.invalidationReason ?? "plan decision no longer resumable",
        });

        return {
          disposition: latestSuspension?.status === "resolved" ? "already_resolved" : "invalidated",
          state,
          continuation: invalidatedContinuation ?? this.normalizeContinuation(this.loadContinuationRow(payload.continuation.continuationId)),
          suspension: latestSuspension,
        };
      }

      if (
        activeSuspension.reasonKind !== "waiting_plan_decision"
        || activeSuspension.threadId !== payload.continuation.threadId
        || activeSuspension.runId !== payload.continuation.runId
        || activeSuspension.taskId !== payload.continuation.taskId
      ) {
        const invalidatedContinuation = this.invalidateContinuationSync({
          continuationId: payload.continuation.continuationId,
          reason: "continuation ownership does not match active plan decision suspension",
        });
        return {
          disposition: "invalidated",
          state,
          continuation: invalidatedContinuation ?? this.normalizeContinuation(this.loadContinuationRow(payload.continuation.continuationId)),
          suspension: activeSuspension,
        };
      }

      const selectedOption = activeSuspension.planDecision.options.find(
        (option) => option.id === payload.continuation.optionId,
      );
      if (!selectedOption) {
        const invalidatedContinuation = this.invalidateContinuationSync({
          continuationId: payload.continuation.continuationId,
          reason: "selected plan decision option is not part of the active suspension",
        });
        return {
          disposition: "invalidated",
          state,
          continuation: invalidatedContinuation ?? this.normalizeContinuation(this.loadContinuationRow(payload.continuation.continuationId)),
          suspension: activeSuspension,
        };
      }

      const consumedContinuation = this.consumeContinuationSync(payload.continuation.continuationId) as PlanDecisionContinuation | undefined;
      if (!consumedContinuation) {
        const currentContinuation = this.normalizeContinuation(this.loadContinuationRow(payload.continuation.continuationId));
        return {
          disposition: currentContinuation?.status === "invalidated" ? "invalidated" : "already_consumed",
          state,
          continuation: currentContinuation,
          suspension: activeSuspension,
        };
      }

      const transitionedSuspension = this.resolveSuspensionSync({
        suspensionId: activeSuspension.suspensionId,
        continuationId: consumedContinuation.continuationId,
      });
      if (!transitionedSuspension) {
        const currentSuspension = this.normalizeSuspension(this.loadLatestSuspensionRow(payload.continuation.runId));
        return {
          disposition: currentSuspension?.status === "resolved" ? "already_resolved" : "invalidated",
          state,
          continuation: consumedContinuation,
          suspension: currentSuspension,
        };
      }

      const resumed = resolveSuspensionAfterPlanDecision({
        suspension: activeSuspension,
        continuation: consumedContinuation,
      });
      const resumedState: RunLoopState = {
        ...state,
        input: resumed.input,
        nextStep: resumed.nextStep,
        planDecision: resumed.planDecision,
        pendingApproval: undefined,
        pauseSummary: undefined,
        recommendationReason: undefined,
      };
      this.writeState(resumedState);

      return {
        disposition: "resumed",
        state: resumedState,
        continuation: consumedContinuation,
        suspension: transitionedSuspension,
      };
    })(input);
  }

  async invalidateRunRecoveryArtifacts(input: {
    runId: string;
    reason: string;
  }): Promise<{ suspensions: number; continuations: number }> {
    return this.db.transaction((payload: typeof input) => {
      const suspensionRows = this.db
        .query<RunSuspensionRow, [string]>(
          `SELECT suspension_id, run_id, thread_id, task_id, approval_request_id, status, payload_json
           FROM run_suspensions
           WHERE run_id = ? AND status = 'active'`,
        )
        .all(payload.runId);
      const continuationRows = this.db
        .query<RunContinuationRow, [string]>(
          `SELECT continuation_id, thread_id, run_id, task_id, approval_request_id, kind, status, payload_json
           FROM run_continuations
           WHERE run_id = ? AND status = 'created'`,
        )
        .all(payload.runId);

      let suspensions = 0;
      let continuations = 0;

      for (const row of suspensionRows) {
        if (this.invalidateSuspensionSync({ suspensionId: row.suspension_id, reason: payload.reason })) {
          suspensions += 1;
        }
      }
      for (const row of continuationRows) {
        if (this.invalidateContinuationSync({ continuationId: row.continuation_id, reason: payload.reason })) {
          continuations += 1;
        }
      }

      return { suspensions, continuations };
    })(input);
  }

  async listSuspensionsByThread(threadId: string): Promise<RunSuspension[]> {
    const rows = this.db
      .query<RunSuspensionRow, [string]>(
        `SELECT suspension_id, run_id, thread_id, task_id, approval_request_id, status, payload_json
         FROM run_suspensions
         WHERE thread_id = ?
         ORDER BY rowid DESC`,
      )
      .all(threadId);

    return rows
      .map((row) => this.normalizeSuspension(row))
      .filter((value): value is RunSuspension => value !== undefined);
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
