export type ToolEffect = "read" | "apply_patch" | "sensitive_write" | "exec";
export type PatchAction = "modify_file" | "create_file" | "delete_file";
export type RiskLevel = "low" | "medium" | "high";

export type RiskRequest = {
  toolName: string;
  effect: ToolEffect;
  action?: PatchAction;
  path?: string;
  changedFiles?: number;
};

export type RiskClassification = {
  key: string;
  level: RiskLevel;
  reason: string;
};

const SENSITIVE_PATH_PATTERNS = [
  /(^|\/)package\.json$/,
  /(^|\/)bun\.lockb?$/,
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.github\//,
  /(^|\/)migrations?\//,
  /(^|\/)scripts?\//,
  /(^|\/)docker/i,
];

export function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

export function classifyRisk(request: RiskRequest): RiskClassification {
  if (request.effect === "apply_patch" && request.action === "delete_file") {
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
