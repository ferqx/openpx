import type { ContinuationEnvelope } from "../../harness/core/run-loop/continuation";
import type { ApprovalSuspension } from "../../harness/core/run-loop/approval-suspension";
import type { RunLoopState } from "../../harness/core/run-loop/step-types";

/** run state store：持久化 run-loop 状态、挂起记录与 continuation。 */
export type RunStateStorePort = {
  loadLatestByThread(threadId: string): Promise<RunLoopState | undefined>;
  loadByRun(runId: string): Promise<RunLoopState | undefined>;
  loadActiveSuspensionByRun(runId: string): Promise<ApprovalSuspension | undefined>;
  loadContinuation(continuationId: string): Promise<ContinuationEnvelope | undefined>;
  saveState(state: RunLoopState): Promise<void>;
  saveSuspension(suspension: ApprovalSuspension): Promise<void>;
  /** continuation 表需要显式落盘，供恢复与审计复用。 */
  saveContinuation(continuation: ContinuationEnvelope): Promise<void>;
  consumeContinuation(continuationId: string): Promise<ContinuationEnvelope | undefined>;
  resolveSuspension(input: { suspensionId: string; continuationId: string }): Promise<boolean>;
  invalidateSuspension(input: { suspensionId: string; reason: string }): Promise<boolean>;
  invalidateContinuation(input: { continuationId: string; reason: string }): Promise<boolean>;
  listSuspensionsByThread(threadId: string): Promise<ApprovalSuspension[]>;
  resetThreadState(threadId: string): Promise<void>;
  deleteActiveRunState(runId: string): Promise<void>;
  deleteExpiredAuditRecords(olderThanIso: string): Promise<{ suspensions: number; continuations: number }>;
};
