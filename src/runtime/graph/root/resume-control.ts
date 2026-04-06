export type ApprovalResolution = {
  kind: "approval_resolution";
  decision: "approved" | "rejected";
  reason?: string;
};

export type ResumeControl = ApprovalResolution;
