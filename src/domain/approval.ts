import { approvalRequestId as sharedApprovalRequestId, taskId as sharedTaskId, threadId as sharedThreadId, toolCallId as sharedToolCallId } from "../shared/ids";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ApprovalToolRequest = {
  toolCallId: ReturnType<typeof sharedToolCallId>;
  threadId: ReturnType<typeof sharedThreadId>;
  taskId: ReturnType<typeof sharedTaskId>;
  toolName: string;
  args: Record<string, unknown>;
  path?: string;
  action?: string;
  changedFiles?: number;
};

export type ApprovalRequest = {
  approvalRequestId: ReturnType<typeof sharedApprovalRequestId>;
  threadId: ReturnType<typeof sharedThreadId>;
  taskId: ReturnType<typeof sharedTaskId>;
  toolCallId: ReturnType<typeof sharedToolCallId>;
  toolRequest: ApprovalToolRequest;
  summary: string;
  risk: string;
  status: ApprovalStatus;
};

export function createApprovalRequest(input: {
  approvalRequestId: string;
  threadId: string;
  taskId: string;
  toolCallId: string;
  toolRequest: {
    toolCallId: string;
    threadId: string;
    taskId: string;
    toolName: string;
    args: Record<string, unknown>;
    path?: string;
    action?: string;
    changedFiles?: number;
  };
  summary: string;
  risk: string;
}): ApprovalRequest {
  return {
    approvalRequestId: sharedApprovalRequestId(input.approvalRequestId),
    threadId: sharedThreadId(input.threadId),
    taskId: sharedTaskId(input.taskId),
    toolCallId: sharedToolCallId(input.toolCallId),
    toolRequest: {
      toolCallId: sharedToolCallId(input.toolRequest.toolCallId),
      threadId: sharedThreadId(input.toolRequest.threadId),
      taskId: sharedTaskId(input.toolRequest.taskId),
      toolName: input.toolRequest.toolName,
      args: input.toolRequest.args,
      path: input.toolRequest.path,
      action: input.toolRequest.action,
      changedFiles: input.toolRequest.changedFiles,
    },
    summary: input.summary,
    risk: input.risk,
    status: "pending",
  };
}
