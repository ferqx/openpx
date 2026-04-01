export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ApprovalRequest = {
  approvalRequestId: string;
  threadId: string;
  taskId: string;
  toolCallId: string;
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
  return { ...input, status: "pending" };
}
