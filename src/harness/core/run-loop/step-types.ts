import type { RecoveryFacts, NarrativeState, WorkingSetWindow } from "../../../control/context/thread-compaction-types";
import type { ArtifactRecord } from "../../../runtime/artifacts/artifact-index";
import type { PlannerResult } from "../../../runtime/planning/planner-result";
import type { WorkPackage } from "../../../runtime/planning/work-package";

/** run-loop step：显式表达下一步要推进到哪个阶段。 */
export type LoopStep = "plan" | "execute" | "verify" | "respond" | "waiting_approval" | "done";

/** run-loop 状态版本：用于判断持久化状态是否还能被当前引擎安全恢复。 */
export const RUN_LOOP_STATE_VERSION = 1;
/** run-loop 引擎版本：用于把持久化状态与运行时代码显式绑定。 */
export const RUN_LOOP_ENGINE_VERSION = "run-loop-v1";

/** verification report：验证报告，用于 verifier 与 responder 之间传递验证结论。 */
export type VerificationReport = {
  summary: string;
  passed?: boolean;
  feedback?: string;
};

/** continuation：暂停后继续执行的结构化输入。 */
export type ContinuationKind =
  | "approval_resolution"
  | "user_resume"
  | "retry_step"
  | "replan"
  | "recover_after_crash";

/** run-loop 纯状态：用于 dispatcher、phase commit 与 engine 共用。 */
export type RunLoopState = {
  stateVersion: number;
  engineVersion: string;
  threadId?: string;
  runId?: string;
  taskId?: string;
  input: string;
  nextStep: LoopStep;
  pendingApproval?: {
    summary: string;
    approvalRequestId: string;
  };
  currentWorkPackageId?: string;
  workPackages?: WorkPackage[];
  plannerResult?: PlannerResult;
  artifacts?: ArtifactRecord[];
  latestArtifacts?: ArtifactRecord[];
  executionSummary?: string;
  verificationReport?: VerificationReport;
  verificationSummary?: string;
  verifierPassed?: boolean;
  verifierFeedback?: string;
  approvedApprovalRequestId?: string;
  lastCompletedToolCallId?: string;
  lastCompletedToolName?: string;
  pendingToolCallId?: string;
  pendingToolName?: string;
  executionDetails?: unknown;
  finalResponse?: string;
  pauseSummary?: string;
  recommendationReason?: string;
  recoveryFacts?: RecoveryFacts;
  narrativeState?: NarrativeState;
  workingSetWindow?: WorkingSetWindow;
};
