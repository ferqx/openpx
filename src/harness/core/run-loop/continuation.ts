import type { ContinuationKind, LoopStep } from "./step-types";

export type ContinuationStatus = "created" | "consumed" | "invalidated";

type ContinuationAuditFields = {
  status?: ContinuationStatus;
  consumedAt?: string;
  invalidatedAt?: string;
  invalidationReason?: string;
};

type ContinuationBase = ContinuationAuditFields & {
  continuationId: string;
  threadId: string;
  runId: string;
  taskId?: string;
  input?: string;
};

/** approval_resolution 必须带完整归属链，不能再构造匿名审批 continuation。 */
export type ApprovalResolutionContinuation = ContinuationBase & {
  kind: "approval_resolution";
  taskId: string;
  approvalRequestId: string;
  decision: "approved" | "rejected";
  reason?: string;
  step?: LoopStep;
};

/** plan_decision 表示用户已选择 planner 提供的方案，继续回到 planner 细化执行计划。 */
export type PlanDecisionContinuation = ContinuationBase & {
  kind: "plan_decision";
  taskId: string;
  optionId: string;
  optionLabel: string;
  input: string;
  step?: LoopStep;
};

type GenericContinuation = ContinuationBase & {
  kind: Exclude<ContinuationKind, "approval_resolution" | "plan_decision">;
  reason?: string;
  step?: LoopStep;
  approvalRequestId?: string;
};

/** continuation envelope：暂停后继续执行的结构化信封。 */
export type ContinuationEnvelope = ApprovalResolutionContinuation | PlanDecisionContinuation | GenericContinuation;

/** 判断 continuation 是否属于审批恢复信封。 */
export function isApprovalResolutionContinuation(value: ContinuationEnvelope): value is ApprovalResolutionContinuation {
  return value.kind === "approval_resolution";
}

/** 判断 continuation 是否属于方案选择恢复信封。 */
export function isPlanDecisionContinuation(value: ContinuationEnvelope): value is PlanDecisionContinuation {
  return value.kind === "plan_decision";
}

/** 生成 continuation id，默认优先使用 crypto.randomUUID。 */
export function createContinuationId(): string {
  return `continuation_${crypto.randomUUID()}`;
}
