export type SubmitInputCommand = {
  type: "submit_input";
  payload: {
    text: string;
  };
};

export type ApprovalCommand =
  | {
      type: "approve_request";
      payload: {
        approvalRequestId: string;
      };
    }
  | {
      type: "reject_request";
      payload: {
        approvalRequestId: string;
      };
    };

export function parseCommand(text: string): SubmitInputCommand | ApprovalCommand {
  const trimmed = text.trim();
  const approveMatch = trimmed.match(/^\/approve\s+(\S+)$/i);
  if (approveMatch) {
    return {
      type: "approve_request",
      payload: {
        approvalRequestId: approveMatch[1]!,
      },
    };
  }

  const rejectMatch = trimmed.match(/^\/reject\s+(\S+)$/i);
  if (rejectMatch) {
    return {
      type: "reject_request",
      payload: {
        approvalRequestId: rejectMatch[1]!,
      },
    };
  }

  return {
    type: "submit_input",
    payload: {
      text,
    },
  };
}
