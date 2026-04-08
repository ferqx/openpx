export type ApprovalResolution = {
  kind: "approval_resolution";
  decision: "approved" | "rejected";
  approvalRequestId?: string;
  reason?: string;
};

export type ResumeControl = ApprovalResolution;
