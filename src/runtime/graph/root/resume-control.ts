export type ApprovedApprovalResolution = {
  kind: "approval_resolution";
  decision: "approved";
  approvalRequestId: string;
};

export type RejectedApprovalResolution = {
  kind: "approval_resolution";
  decision: "rejected";
  approvalRequestId?: string;
  reason?: string;
};

export type ApprovalResolution = ApprovedApprovalResolution | RejectedApprovalResolution;

export type ResumeControl = ApprovalResolution;
