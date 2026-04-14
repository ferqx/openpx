/** 审批通过后的恢复控制：告诉根图继续执行，并带上 approvalRequestId */
export type ApprovedApprovalResolution = {
  kind: "approval_resolution";
  decision: "approved";
  approvalRequestId: string;
};

/** 审批拒绝后的恢复控制：允许带 rejection reason，供 planner 改写策略 */
export type RejectedApprovalResolution = {
  kind: "approval_resolution";
  decision: "rejected";
  approvalRequestId?: string;
  reason?: string;
};

/** 审批恢复控制联合类型 */
export type ApprovalResolution = ApprovedApprovalResolution | RejectedApprovalResolution;

/** 根图当前支持的 structured resume 输入 */
export type ResumeControl = ApprovalResolution;
