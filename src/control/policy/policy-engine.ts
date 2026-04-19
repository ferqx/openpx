import { isAbsolute, relative, resolve } from "node:path";
import { classifyRisk, type PatchAction, type RiskClassification, type ToolEffect } from "./risk-model";
import type { PermissionMode } from "../../config/types";

/** policy engine 输入：把工具请求抽象为统一副作用模型 */
export type PolicyRequest = {
  toolName: string;
  effect: ToolEffect;
  action?: PatchAction;
  path?: string;
  changedFiles?: number;
  command?: string;
  commandArgs?: string[];
  cwd?: string;
};

/** policy engine 输出：允许、需审批或直接拒绝 */
export type PolicyDecision =
  | {
      kind: "allow";
      reason: string;
      risk: RiskClassification;
    }
  | {
      kind: "needs_approval";
      reason: string;
      risk: RiskClassification;
    }
  | {
      kind: "deny";
      reason: string;
      risk: RiskClassification;
    };

/** 创建策略引擎：基于 allowed roots 和风险等级裁决工具请求 */
export function createPolicyEngine(input: {
  workspaceRoot: string;
  permissionMode?: PermissionMode;
  additionalDirectories?: string[];
}) {
  const workspaceRoot = resolve(input.workspaceRoot);
  const allowedRoots = [
    workspaceRoot,
    ...(input.additionalDirectories ?? []).map((directory) => resolve(directory)),
  ];
  const permissionMode = input.permissionMode ?? "guarded";

  /** 路径是否仍在 workspace 内，防止 ../ 或同前缀目录逃逸 */
  function isWithinAllowedRoots(path: string): boolean {
    const resolvedPath = resolve(path);
    return allowedRoots.some((root) => {
      const rootRelativePath = relative(root, resolvedPath);
      return rootRelativePath === "" || (!rootRelativePath.startsWith("..") && !isAbsolute(rootRelativePath));
    });
  }

  /** 识别只读终端命令：命中时可以直接放行 */
  function isReadOnlyExec(request: PolicyRequest): boolean {
    const command = request.command;
    if (!command) return false;
    const args = request.commandArgs ?? [];
    const normalizedCommand = command.toLowerCase();

    if (["pwd", "ls", "find", "rg", "cat", "head", "tail", "wc", "stat"].includes(normalizedCommand)) {
      return true;
    }

    if (normalizedCommand === "sed") {
      return !args.some((arg) => arg === "-i" || arg.startsWith("-i"));
    }

    if (normalizedCommand === "git") {
      const subcommand = args[0];
      return ["status", "diff", "show", "log", "branch", "rev-parse", "ls-files", "grep", "blame"].includes(subcommand ?? "");
    }

    if (normalizedCommand === "powershell" || normalizedCommand === "powershell.exe" || normalizedCommand === "pwsh") {
      const commandFlagIndex = args.findIndex((arg) => arg.toLowerCase() === "-command");
      if (commandFlagIndex === -1) {
        return false;
      }

      const script = args[commandFlagIndex + 1]?.trim().toLowerCase();
      return script === "get-location" || script === "get-childitem";
    }

    return false;
  }

  return {
    workspaceRoot,

    evaluate(request: PolicyRequest): PolicyDecision {
      const risk = classifyRisk(request);

      if ((request.effect === "apply_patch" || request.effect === "sensitive_write" || request.effect === "read") && request.path) {
        if (!isWithinAllowedRoots(request.path)) {
          return {
            kind: "deny",
            reason: "filesystem target is outside the allowed roots",
            risk,
          };
        }
      }

      if (request.effect === "exec" && request.cwd && !isWithinAllowedRoots(request.cwd)) {
        return {
          kind: "deny",
          reason: "terminal commands outside the allowed roots are denied",
          risk,
        };
      }

      if (permissionMode === "full_access") {
        if (request.effect === "read") {
          return {
            kind: "allow",
            reason: "full_access allows reads within allowed roots",
            risk,
          };
        }

        if (request.effect === "apply_patch" || request.effect === "sensitive_write") {
          return {
            kind: "allow",
            reason: "full_access allows writes within allowed roots",
            risk,
          };
        }

        if (request.effect === "exec") {
          return {
            kind: "allow",
            reason: "full_access allows terminal commands within allowed roots",
            risk,
          };
        }
      }

      if (request.effect === "apply_patch" && request.action === "delete_file") {
        return {
          kind: "needs_approval",
          reason: "delete_file requires approval",
          risk,
        };
      }

      if ((request.effect === "apply_patch" || request.effect === "sensitive_write") && request.path) {
        if (risk.level !== "low") {
          return {
            kind: "needs_approval",
            reason: risk.reason,
            risk,
          };
        }

        return {
          kind: "allow",
          reason: "safe workspace patch",
          risk,
        };
      }

      if (request.effect === "read") {
        if (request.path && isWithinAllowedRoots(request.path)) {
          return {
            kind: "allow",
            reason: "allowed-root reads are allowed",
            risk,
          };
        }

        return {
          kind: "deny",
          reason: "reads outside the allowed roots are denied",
          risk,
        };
      }

      if (request.effect === "exec") {
        if (isReadOnlyExec(request)) {
          return {
            kind: "allow",
            reason: "read-only terminal command",
            risk,
          };
        }

        return {
          kind: "needs_approval",
          reason: risk.reason,
          risk,
        };
      }

      // 未知 effect 默认拒绝，避免新工具类型在未建模时被意外放行。
      return {
        kind: "deny",
        reason: "unsupported tool request",
        risk,
      };
    },
  };
}
