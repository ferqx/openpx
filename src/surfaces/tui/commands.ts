/** 普通提交命令：直接走 submit_input */
export type SubmitInputCommand = {
  type: "submit_input";
  payload: {
    text: string;
  };
};

/** 规划提交命令：在 TUI 层与普通提交显式区分 */
export type PlanInputCommand = {
  type: "plan_input";
  payload: {
    text: string;
  };
};

/** 审批命令：对应 approve / reject 两条路径 */
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

/** 协作线命令：新建、切换、继续或列出线程 */
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

/** TUI 解析后的输入结果：普通提交、规划提交或本地命令 */
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

/** slash 命令定义：驱动提示菜单与立即执行行为 */
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

/** 仅当输入是“纯 slash 查询”时返回可补全 query */
export function getSlashCommandQuery(text: string): string | null {
  if (!text.startsWith("/")) {
    return null;
  }

  if (/\s/.test(text.slice(1))) {
    return null;
  }

  return text.slice(1).toLowerCase();
}

/** 根据 query 过滤 slash 命令定义 */
export function getSlashCommandDefinitions(query: string): SlashCommandDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return SLASH_COMMANDS;
  }

  return SLASH_COMMANDS.filter((definition) => definition.command.slice(1).startsWith(normalized));
}

/** 生成 slash 建议列表 */
export function getSlashCommandSuggestions(query: string): string[] {
  return getSlashCommandDefinitions(query).map((definition) => definition.command);
}

/** 解析 composer 输入；未命中命令时一律回退为普通 submit */
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
