import { createContinuationId, type ContinuationEnvelope } from "./continuation";
import type { LoopStep } from "./step-types";

/** approval suspension：等待审批时的显式挂起记录。 */
export type ApprovalSuspension = {
  suspensionId: string;
  threadId: string;
  runId: string;
  taskId: string;
  reasonKind: "waiting_approval";
  summary: string;
  approvalRequestId: string;
  resumeStep: LoopStep;
  createdAt: string;
};

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
  };
}

/** 把审批决议封装成 continuation。 */
export function buildApprovalContinuation(input: {
  approvalRequestId?: string;
  decision: "approved" | "rejected";
  reason?: string;
}): ContinuationEnvelope {
  return {
    continuationId: createContinuationId(),
    kind: "approval_resolution",
    approvalRequestId: input.approvalRequestId,
    decision: input.decision,
    reason: input.reason,
  };
}

/** 根据审批决议恢复下一步；批准回原步骤，拒绝回 plan。 */
export function resolveSuspensionAfterApproval(input: {
  suspension: ApprovalSuspension;
  continuation: ContinuationEnvelope;
  originalInput: string;
}) {
  if (input.continuation.kind !== "approval_resolution") {
    throw new Error("approval suspension can only be resolved by approval_resolution continuation");
  }

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
