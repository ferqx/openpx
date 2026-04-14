import { createApprovalRequest, type ApprovalRequest, type ApprovalToolRequest } from "../../domain/approval";

/** 创建待审批请求所需的最小信息 */
export type CreateApprovalInput = {
  toolCallId: string;
  threadId: string;
  runId?: string;
  taskId: string;
  toolRequest: ApprovalToolRequest;
  summary: string;
  risk: string;
};

/** 创建内存版审批服务：持久化包装由 app/bootstrap 在外层补上 */
export function createApprovalService(input?: { idGenerator?: () => string }) {
  const requests = new Map<string, ApprovalRequest>();
  const idGenerator =
    input?.idGenerator ??
    (() => `approval_${crypto.randomUUID()}`);

  return {
    async createPending(request: CreateApprovalInput): Promise<ApprovalRequest> {
      // 同一个 toolCallId 只保留一条 pending 审批，避免重复审批卡片。
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
        runId: request.runId,
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

/** 审批服务接口类型：供 control-plane 和 tool-registry 共享 */
export type ApprovalService = ReturnType<typeof createApprovalService>;
