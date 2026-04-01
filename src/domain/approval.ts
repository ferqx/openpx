import { approvalRequestId as sharedApprovalRequestId, taskId as sharedTaskId, threadId as sharedThreadId, toolCallId as sharedToolCallId } from "../shared/ids";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ApprovalRequest = {
  approvalRequestId: ReturnType<typeof sharedApprovalRequestId>;
  threadId: ReturnType<typeof sharedThreadId>;
  taskId: ReturnType<typeof sharedTaskId>;
  toolCallId: ReturnType<typeof sharedToolCallId>;
  summary: string;
  risk: string;
  status: ApprovalStatus;
};

export function createApprovalRequest(input: {
  approvalRequestId: string;
  threadId: string;
  taskId: string;
  toolCallId: string;
  summary: string;
  risk: string;
}): ApprovalRequest {
  return {
    approvalRequestId: sharedApprovalRequestId(input.approvalRequestId),
    threadId: sharedThreadId(input.threadId),
    taskId: sharedTaskId(input.taskId),
    toolCallId: sharedToolCallId(input.toolCallId),
    summary: input.summary,
    risk: input.risk,
    status: "pending",
  };
}
