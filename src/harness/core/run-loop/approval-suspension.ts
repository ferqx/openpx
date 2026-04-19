import {
  createContinuationId,
  type ApprovalResolutionContinuation,
  type PlanDecisionContinuation,
} from "./continuation";
import type { PlanDecisionRequest } from "../../../runtime/planning/planner-result";
import type { LoopStep } from "./step-types";

export type SuspensionStatus = "active" | "resolved" | "invalidated";

/** approval suspension：等待审批时的显式挂起记录。 */
type BaseSuspension = {
  suspensionId: string;
  threadId: string;
  runId: string;
  taskId: string;
  summary: string;
  resumeStep: LoopStep;
  createdAt: string;
  status: SuspensionStatus;
  resolvedAt?: string;
  resolvedByContinuationId?: string;
  invalidatedAt?: string;
  invalidationReason?: string;
};

/** approval suspension：等待审批时的显式挂起记录。 */
export type ApprovalSuspension = BaseSuspension & {
  reasonKind: "waiting_approval";
  approvalRequestId: string;
};

/** plan decision suspension：等待用户选择 planner 方案时的显式挂起记录。 */
export type PlanDecisionSuspension = BaseSuspension & {
  reasonKind: "waiting_plan_decision";
  planDecision: PlanDecisionRequest;
};

/** run suspension：run-loop 可持久恢复的挂起记录联合。 */
export type RunSuspension = ApprovalSuspension | PlanDecisionSuspension;

/** 显式创建审批挂起，替代旧的隐式 interrupt 机制。 */
export function createApprovalSuspension(input: {
  threadId: string;
  runId: string;
  taskId: string;
  step: LoopStep;
  summary: string;
  approvalRequestId: string;
}): ApprovalSuspension {
  return {
    suspensionId: `suspension_${crypto.randomUUID()}`,
    threadId: input.threadId,
    runId: input.runId,
    taskId: input.taskId,
    reasonKind: "waiting_approval",
    summary: input.summary,
    approvalRequestId: input.approvalRequestId,
    resumeStep: input.step,
    createdAt: new Date().toISOString(),
    status: "active",
  };
}

/** 显式创建方案选择挂起，让 plan mode 的用户选择可跨重启恢复。 */
export function createPlanDecisionSuspension(input: {
  threadId: string;
  runId: string;
  taskId: string;
  summary: string;
  planDecision: PlanDecisionRequest;
}): PlanDecisionSuspension {
  return {
    suspensionId: `suspension_${crypto.randomUUID()}`,
    threadId: input.threadId,
    runId: input.runId,
    taskId: input.taskId,
    reasonKind: "waiting_plan_decision",
    summary: input.summary,
    planDecision: input.planDecision,
    resumeStep: "plan",
    createdAt: new Date().toISOString(),
    status: "active",
  };
}

/** 把审批决议封装成 continuation。 */
export function buildApprovalContinuation(input: {
  threadId: string;
  runId: string;
  taskId: string;
  approvalRequestId: string;
  decision: "approved" | "rejected";
  reason?: string;
  step?: LoopStep;
}): ApprovalResolutionContinuation {
  return {
    continuationId: createContinuationId(),
    threadId: input.threadId,
    runId: input.runId,
    taskId: input.taskId,
    kind: "approval_resolution",
    approvalRequestId: input.approvalRequestId,
    decision: input.decision,
    reason: input.reason,
    step: input.step,
    status: "created",
  };
}

/** 把用户选择的方案封装成 continuation。 */
export function buildPlanDecisionContinuation(input: {
  threadId: string;
  runId: string;
  taskId: string;
  optionId: string;
  optionLabel: string;
  input: string;
}): PlanDecisionContinuation {
  return {
    continuationId: createContinuationId(),
    threadId: input.threadId,
    runId: input.runId,
    taskId: input.taskId,
    kind: "plan_decision",
    optionId: input.optionId,
    optionLabel: input.optionLabel,
    input: input.input,
    status: "created",
  };
}

/** 根据审批决议恢复下一步；批准回原步骤，拒绝回 plan。 */
export function resolveSuspensionAfterApproval(input: {
  suspension: ApprovalSuspension;
  continuation: ApprovalResolutionContinuation;
  originalInput: string;
}) {
  if (input.continuation.decision === "approved") {
    return {
      input: input.originalInput,
      nextStep: input.suspension.resumeStep,
      approvedApprovalRequestId: input.continuation.approvalRequestId,
    };
  }

  return {
    input: input.continuation.reason ?? input.originalInput,
    nextStep: "plan" as const,
    approvedApprovalRequestId: undefined,
  };
}

/** 方案选择恢复后回到 planner，让用户选择成为新的规划输入。 */
export function resolveSuspensionAfterPlanDecision(input: {
  suspension: PlanDecisionSuspension;
  continuation: PlanDecisionContinuation;
}) {
  return {
    input: input.continuation.input,
    nextStep: input.suspension.resumeStep,
    planDecision: undefined,
  };
}
