export type SubmitInputCommand = {
  type: "submit_input";
  payload: {
    text: string;
  };
};

export type PlanInputCommand = {
  type: "plan_input";
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

export type TuiParsedInput =
  | {
      kind: "submit";
      text: string;
    }
  | {
      kind: "plan";
      text: string;
    }
  | {
      kind: "command";
      name: "new" | "history" | "sessions" | "clear" | "settings" | "help";
    };

export type SlashCommandDefinition = {
  command: "/new" | "/plan" | "/history" | "/sessions" | "/clear" | "/settings" | "/help";
  description: string;
  acceptsArgs: boolean;
  executesImmediately: boolean;
};

const SLASH_COMMANDS: SlashCommandDefinition[] = [
  { command: "/new", description: "Start a new thread", acceptsArgs: false, executesImmediately: true },
  { command: "/plan", description: "Plan before execution", acceptsArgs: true, executesImmediately: false },
  { command: "/history", description: "Show current thread history", acceptsArgs: false, executesImmediately: true },
  { command: "/sessions", description: "Show available sessions", acceptsArgs: false, executesImmediately: true },
  { command: "/clear", description: "Clear transient screen output", acceptsArgs: false, executesImmediately: true },
  { command: "/settings", description: "Open shell settings", acceptsArgs: false, executesImmediately: true },
  { command: "/help", description: "Show shell help", acceptsArgs: false, executesImmediately: true },
];

export function getSlashCommandQuery(text: string): string | null {
  if (!text.startsWith("/")) {
    return null;
  }

  if (/\s/.test(text.slice(1))) {
    return null;
  }

  return text.slice(1).toLowerCase();
}

export function getSlashCommandDefinitions(query: string): SlashCommandDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return SLASH_COMMANDS;
  }

  return SLASH_COMMANDS.filter((definition) => definition.command.slice(1).startsWith(normalized));
}

export function getSlashCommandSuggestions(query: string): string[] {
  return getSlashCommandDefinitions(query).map((definition) => definition.command);
}

export function parseCommand(text: string): TuiParsedInput {
  const trimmed = text.trim();

  if (/^\/new$/i.test(trimmed)) {
    return {
      kind: "command",
      name: "new",
    };
  }

  const planMatch = trimmed.match(/^\/plan(?:\s+(.+))?$/i);
  if (planMatch) {
    return {
      kind: "plan",
      text: planMatch[1]?.trim() ?? "",
    };
  }

  if (/^\/history$/i.test(trimmed)) {
    return {
      kind: "command",
      name: "history",
    };
  }

  if (/^\/sessions$/i.test(trimmed)) {
    return {
      kind: "command",
      name: "sessions",
    };
  }

  if (/^\/clear$/i.test(trimmed)) {
    return {
      kind: "command",
      name: "clear",
    };
  }

  if (/^\/settings$/i.test(trimmed)) {
    return {
      kind: "command",
      name: "settings",
    };
  }

  if (/^\/help$/i.test(trimmed)) {
    return {
      kind: "command",
      name: "help",
    };
  }

  return {
    kind: "submit",
    text,
  };
}
