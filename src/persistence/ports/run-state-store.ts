import type {
  ApprovalResolutionContinuation,
  ContinuationEnvelope,
  PlanDecisionContinuation,
} from "../../harness/core/run-loop/continuation";
import type { RunSuspension } from "../../harness/core/run-loop/approval-suspension";
import type { RunLoopState } from "../../harness/core/run-loop/step-types";

export type RunLoopResumeDisposition =
  | "resumed"
  | "already_resolved"
  | "already_consumed"
  | "invalidated"
  | "not_resumable";

export type ApprovalContinuationTransactionResult = {
  disposition: RunLoopResumeDisposition;
  state: RunLoopState;
  continuation?: ContinuationEnvelope;
  suspension?: RunSuspension;
};

export type PlanDecisionContinuationTransactionResult = {
  disposition: RunLoopResumeDisposition;
  state: RunLoopState;
  continuation?: ContinuationEnvelope;
  suspension?: RunSuspension;
};

/** run state store：持久化 run-loop 状态、挂起记录与 continuation。 */
export type RunStateStorePort = {
  loadLatestByThread(threadId: string): Promise<RunLoopState | undefined>;
  loadByRun(runId: string): Promise<RunLoopState | undefined>;
  loadActiveSuspensionByRun(runId: string): Promise<RunSuspension | undefined>;
  loadContinuation(continuationId: string): Promise<ContinuationEnvelope | undefined>;
  saveState(state: RunLoopState): Promise<void>;
  saveSuspension(suspension: RunSuspension): Promise<void>;
  /** continuation 表需要显式落盘，供恢复与审计复用。 */
  saveContinuation(continuation: ContinuationEnvelope): Promise<void>;
  consumeContinuation(continuationId: string): Promise<ContinuationEnvelope | undefined>;
  resolveSuspension(input: { suspensionId: string; continuationId: string }): Promise<boolean>;
  invalidateSuspension(input: { suspensionId: string; reason: string }): Promise<boolean>;
  invalidateContinuation(input: { continuationId: string; reason: string }): Promise<boolean>;
  applyApprovalContinuation(input: {
    continuation: ApprovalResolutionContinuation;
    expectedStateVersion: number;
    expectedEngineVersion: string;
  }): Promise<ApprovalContinuationTransactionResult>;
  applyPlanDecisionContinuation(input: {
    continuation: PlanDecisionContinuation;
    expectedStateVersion: number;
    expectedEngineVersion: string;
  }): Promise<PlanDecisionContinuationTransactionResult>;
  invalidateRunRecoveryArtifacts(input: {
    runId: string;
    reason: string;
  }): Promise<{ suspensions: number; continuations: number }>;
  listSuspensionsByThread(threadId: string): Promise<RunSuspension[]>;
  resetThreadState(threadId: string): Promise<void>;
  deleteActiveRunState(runId: string): Promise<void>;
  deleteExpiredAuditRecords(olderThanIso: string): Promise<{ suspensions: number; continuations: number }>;
};
