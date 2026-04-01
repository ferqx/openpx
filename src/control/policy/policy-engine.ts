import { isAbsolute, relative, resolve } from "node:path";
import { classifyRisk, type PatchAction, type RiskClassification, type ToolEffect } from "./risk-model";

export type PolicyRequest = {
  toolName: string;
  effect: ToolEffect;
  action?: PatchAction;
  path?: string;
  changedFiles?: number;
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

  return {
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

      return {
        kind: "deny",
        reason: "unsupported tool request",
        risk,
      };
    },
  };
}
