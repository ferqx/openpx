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

export type ThreadCommand =
  | {
      type: "thread_new";
    }
  | {
      type: "thread_switch";
      payload: {
        threadId: string;
      };
    }
  | {
      type: "thread_continue";
      payload: {
        threadId?: string;
      };
    }
  | {
      type: "thread_list";
    };

export function parseCommand(text: string): SubmitInputCommand | ApprovalCommand | ThreadCommand {
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

  if (/^\/thread\s+new$/i.test(trimmed)) {
    return {
      type: "thread_new",
    };
  }

  const threadSwitchMatch = trimmed.match(/^\/thread\s+switch\s+(\S+)$/i);
  if (threadSwitchMatch) {
    return {
      type: "thread_switch",
      payload: {
        threadId: threadSwitchMatch[1]!,
      },
    };
  }

  const threadContinueMatch = trimmed.match(/^\/thread\s+continue(?:\s+(\S+))?$/i);
  if (threadContinueMatch) {
    return {
      type: "thread_continue",
      payload: {
        threadId: threadContinueMatch[1] ?? undefined,
      },
    };
  }

  if (/^\/thread\s+list$/i.test(trimmed)) {
    return {
      type: "thread_list",
    };
  }

  return {
    type: "submit_input",
    payload: {
      text,
    },
  };
}
