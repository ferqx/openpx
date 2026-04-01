import type { ApprovalRequest } from "../../domain/approval";
import type { PolicyDecision, PolicyRequest } from "../policy/policy-engine";
import type { PatchAction, ToolEffect } from "../policy/risk-model";

export type ToolExecuteRequest = {
  toolCallId: string;
  threadId: string;
  taskId: string;
  toolName: string;
  args: Record<string, unknown>;
  path?: string;
  action?: PatchAction;
  changedFiles?: number;
};

export type ToolExecutionContext = {
  request: ToolExecuteRequest;
} & ToolExecuteRequest;

export type ToolExecutor = (context: ToolExecutionContext) => Promise<unknown>;

export type ToolDefinition = {
  name: string;
  effect: ToolEffect;
  execute: ToolExecutor;
};

export type ToolExecutionOutcome =
  | {
      kind: "executed";
      decision: PolicyDecision;
      output: unknown;
    }
  | {
      kind: "blocked";
      decision: Extract<PolicyDecision, { kind: "needs_approval" }>;
      reason: string;
      approvalRequest: ApprovalRequest;
    }
  | {
      kind: "denied";
      decision: Extract<PolicyDecision, { kind: "deny" }>;
      reason: string;
    };

export function toPolicyRequest(tool: ToolDefinition, request: ToolExecuteRequest): PolicyRequest {
  return {
    toolName: tool.name,
    effect: tool.effect,
    action: request.action,
    path: request.path,
    changedFiles: request.changedFiles,
  };
}

export function normalizeToolRequest(request: ToolExecuteRequest): ToolExecuteRequest {
  const path = request.path ?? (typeof request.args.path === "string" ? request.args.path : undefined);
  return {
    ...request,
    path,
  };
}
