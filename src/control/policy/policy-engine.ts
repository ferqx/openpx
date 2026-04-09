import { isAbsolute, relative, resolve } from "node:path";
import { classifyRisk, type PatchAction, type RiskClassification, type ToolEffect } from "./risk-model";

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

export function createPolicyEngine(input: { workspaceRoot: string }) {
  const workspaceRoot = resolve(input.workspaceRoot);

  function isWithinWorkspace(path: string): boolean {
    const resolvedPath = resolve(path);
    const workspaceRelativePath = relative(workspaceRoot, resolvedPath);
    return workspaceRelativePath === "" || (!workspaceRelativePath.startsWith("..") && !isAbsolute(workspaceRelativePath));
  }

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

      if (request.effect === "apply_patch" && request.action === "delete_file") {
        return {
          kind: "needs_approval",
          reason: "delete_file requires approval",
          risk,
        };
      }

      if ((request.effect === "apply_patch" || request.effect === "sensitive_write") && request.path) {
        if (!isWithinWorkspace(request.path)) {
          return {
            kind: "deny",
            reason: "writes outside the workspace are denied",
            risk,
          };
        }

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
        if (request.path && isWithinWorkspace(request.path)) {
          return {
            kind: "allow",
            reason: "workspace reads are allowed",
            risk,
          };
        }

        return {
          kind: "deny",
          reason: "reads outside the workspace are denied",
          risk,
        };
      }

      if (request.effect === "exec") {
        if (request.cwd && !isWithinWorkspace(request.cwd)) {
          return {
            kind: "deny",
            reason: "terminal commands outside the workspace are denied",
            risk,
          };
        }

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

      return {
        kind: "deny",
        reason: "unsupported tool request",
        risk,
      };
    },
  };
}
