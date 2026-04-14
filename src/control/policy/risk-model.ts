/** 工具效果类型：从读取、补丁写入到终端执行的粗粒度副作用分类 */
export type ToolEffect = "read" | "apply_patch" | "sensitive_write" | "exec";
export type PatchAction = "modify_file" | "create_file" | "delete_file";
export type RiskLevel = "low" | "medium" | "high";

/** 风险评估输入 */
export type RiskRequest = {
  toolName: string;
  effect: ToolEffect;
  action?: PatchAction;
  path?: string;
  changedFiles?: number;
  command?: string;
  commandArgs?: string[];
  cwd?: string;
};

/** 风险分类结果：保留稳定 key、等级与原因 */
export type RiskClassification = {
  key: string;
  level: RiskLevel;
  reason: string;
};

/** 敏感路径模式：命中后通常需要审批 */
const SENSITIVE_PATH_PATTERNS = [
  /(^|\/)package\.json$/,
  /(^|\/)bun\.lockb?$/,
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.github\//,
  /(^|\/)migrations?\//,
  /(^|\/)scripts?\//,
  /(^|\/)docker/i,
];

/** 判断路径是否命中敏感区域 */
export function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

/** 对单个工具请求做粗粒度风险分类，供 policy engine 进一步裁决 */
export function classifyRisk(request: RiskRequest): RiskClassification {
  if (request.effect === "exec") {
    const command = request.command ?? request.toolName;
    const args = request.commandArgs ?? [];
    const readOnlyCommands = ["pwd", "ls", "find", "rg", "cat", "head", "tail", "wc", "stat"];
    const readOnlyGitCommands = ["status", "diff", "show", "log", "branch", "rev-parse", "ls-files", "grep", "blame"];

    if (readOnlyCommands.includes(command)) {
      return {
        key: "exec.read_only",
        level: "low",
        reason: "read-only command",
      };
    }

    if (command === "sed" && !args.some((arg) => arg === "-i" || arg.startsWith("-i"))) {
      return {
        key: "exec.read_only",
        level: "low",
        reason: "read-only command",
      };
    }

    if (command === "git" && readOnlyGitCommands.includes(args[0] ?? "")) {
      return {
        key: "exec.read_only",
        level: "low",
        reason: "read-only command",
      };
    }

    return {
      key: `exec.${command}`,
      level: "medium",
      reason: `command ${command} requires approval`,
    };
  }

  if (request.effect === "apply_patch" && request.action === "delete_file") {
    // 删除文件是当前最高风险的补丁动作，直接提升到 high。
    return {
      key: "apply_patch.delete_file",
      level: "high",
      reason: "delete_file requires approval",
    };
  }

  if (request.path && isSensitivePath(request.path)) {
    return {
      key: `${request.toolName}.sensitive_path`,
      level: "medium",
      reason: "sensitive files require approval",
    };
  }

  if ((request.changedFiles ?? 0) > 10) {
    return {
      key: `${request.toolName}.large_change`,
      level: "medium",
      reason: "large changes require approval",
    };
  }

  return {
    key: `${request.toolName}.standard`,
    level: "low",
    reason: "ordinary request",
  };
}
