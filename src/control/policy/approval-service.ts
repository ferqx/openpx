import { createApprovalRequest, type ApprovalRequest, type ApprovalToolRequest } from "../../domain/approval";

export type CreateApprovalInput = {
  toolCallId: string;
  threadId: string;
  taskId: string;
  toolRequest: ApprovalToolRequest;
  summary: string;
  risk: string;
};

export function createApprovalService(input?: { idGenerator?: () => string }) {
  const requests = new Map<string, ApprovalRequest>();
  const idGenerator =
    input?.idGenerator ??
    (() => `approval_${crypto.randomUUID()}`);

  return {
    async createPending(request: CreateApprovalInput): Promise<ApprovalRequest> {
      // Check if a pending request already exists for this tool call
      const existing = [...requests.values()].find(
        (r) => r.toolCallId === request.toolCallId && r.status === "pending",
      );
      if (existing) {
        return existing;
      }

      const approval = createApprovalRequest({
        approvalRequestId: idGenerator(),
        toolCallId: request.toolCallId,
        threadId: request.threadId,
        taskId: request.taskId,
        toolRequest: request.toolRequest,
        summary: request.summary,
        risk: request.risk,
      });

      requests.set(approval.approvalRequestId, approval);
      return approval;
    },

    async get(approvalRequestId: string): Promise<ApprovalRequest | undefined> {
      return requests.get(approvalRequestId);
    },

    async listPendingByThread(threadId: string): Promise<ApprovalRequest[]> {
      return [...requests.values()].filter((request) => request.threadId === threadId && request.status === "pending");
    },

    async updateStatus(
      approvalRequestId: string,
      status: Exclude<ApprovalRequest["status"], "pending">,
    ): Promise<ApprovalRequest | undefined> {
      const approval = requests.get(approvalRequestId);
      if (!approval) {
        return undefined;
      }

      const updated = { ...approval, status };
      requests.set(approvalRequestId, updated);
      return updated;
    },
  };
}

export type ApprovalService = ReturnType<typeof createApprovalService>;
