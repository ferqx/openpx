/**
 * @module domain/approval
 * 审批（approval）领域实体。
 *
 * ApprovalRequest 表示一次必须经过人工确认的高风险工具动作。
 * 它把 thread（协作线）/run（执行尝试）/task（具体步骤）/toolCall（工具调用）
 * 串起来，确保批准点始终可以回到正确的执行上下文继续推进。
 *
 * ApprovalToolRequest 是被审批的原始工具调用请求，携带工具名、参数和影响范围。
 * ApprovalStatus 跟踪审批生命周期：pending → approved/rejected/cancelled。
 */
import {
  approvalRequestId as sharedApprovalRequestId,
  runId as sharedRunId,
  taskId as sharedTaskId,
  threadId as sharedThreadId,
  toolCallId as sharedToolCallId,
} from "../shared/ids";

/** 审批状态：pending=待审批，approved=已批准，rejected=已拒绝，cancelled=已取消 */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

/**
 * 审批工具请求——记录被拦截的原始工具调用，包含工具名、参数和影响范围。
 * 当运行时判定某个工具调用需要人工审批时，会将其封装为 ApprovalToolRequest。
 */
export type ApprovalToolRequest = {
  /** toolCallId——工具调用标识，关联到触发审批的 ToolCall */
  toolCallId: ReturnType<typeof sharedToolCallId>;
  /** threadId——协作线标识，定位所属协作线 */
  threadId: ReturnType<typeof sharedThreadId>;
  /** runId——执行尝试标识，定位所属 run */
  runId: ReturnType<typeof sharedRunId>;
  /** taskId——具体步骤标识，定位所属 task */
  taskId: ReturnType<typeof sharedTaskId>;
  /** toolName——工具名称，例如 "shell" 或 "edit" */
  toolName: string;
  /** args——工具调用参数 */
  args: Record<string, unknown>;
  /** path——受影响的文件或目录路径（可选） */
  path?: string;
  /** action——工具动作类型描述，如 "write"、"delete"（可选） */
  action?: string;
  /** changedFiles——变更文件数量估算（可选） */
  changedFiles?: number;
};

/**
 * 审批请求——完整审批记录，关联 thread/run/task/toolCall 四层执行上下文。
 * 包含操作摘要、风险评估和审批状态，是人工审批流的完整载体。
 */
export type ApprovalRequest = {
  /** approvalRequestId——审批请求唯一标识 */
  approvalRequestId: ReturnType<typeof sharedApprovalRequestId>;
  /** threadId——协作线标识 */
  threadId: ReturnType<typeof sharedThreadId>;
  /** runId——执行尝试标识 */
  runId: ReturnType<typeof sharedRunId>;
  /** taskId——具体步骤标识 */
  taskId: ReturnType<typeof sharedTaskId>;
  /** toolCallId——触发审批的工具调用标识 */
  toolCallId: ReturnType<typeof sharedToolCallId>;
  /** toolRequest——被审批的原始工具调用请求 */
  toolRequest: ApprovalToolRequest;
  /** summary——审批摘要，人类可读的操作描述 */
  summary: string;
  /** risk——风险评估描述，说明为何需要人工确认 */
  risk: string;
  /** status——审批状态，跟踪生命周期 */
  status: ApprovalStatus;
};

/**
 * 创建审批请求工厂函数。
 * 自动回填 runId（优先使用显式 runId，其次取 toolRequest 中的，最后回退到 taskId），
 * 并设置初始状态为 pending。
 */
export function createApprovalRequest(input: {
  approvalRequestId: string;
  threadId: string;
  runId?: string;
  taskId: string;
  toolCallId: string;
  toolRequest: {
    toolCallId: string;
    threadId: string;
    runId?: string;
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
  // 优先使用显式 runId，其次取 toolRequest 中的，最后回退到 taskId
  const resolvedRunId = input.runId ?? input.toolRequest.runId ?? input.taskId;
  return {
    approvalRequestId: sharedApprovalRequestId(input.approvalRequestId),
    threadId: sharedThreadId(input.threadId),
    runId: sharedRunId(resolvedRunId),
    taskId: sharedTaskId(input.taskId),
    toolCallId: sharedToolCallId(input.toolCallId),
    toolRequest: {
      toolCallId: sharedToolCallId(input.toolRequest.toolCallId),
      threadId: sharedThreadId(input.toolRequest.threadId),
      runId: sharedRunId(resolvedRunId),
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
