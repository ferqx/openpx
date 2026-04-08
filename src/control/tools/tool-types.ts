import type { ApprovalRequest } from "../../domain/approval";
import type { PolicyDecision, PolicyRequest } from "../policy/policy-engine";
import type { PatchAction, ToolEffect } from "../policy/risk-model";

export type ToolExecuteRequest = {
  toolCallId: string;
  threadId: string;
  runId?: string;
  taskId: string;
  toolName: string;
  args: Record<string, unknown>;
  path?: string;
  command?: string;
  commandArgs?: string[];
  cwd?: string;
  timeoutMs?: number;
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
  isEffectful?: boolean;
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
    command: request.command,
    commandArgs: request.commandArgs,
    cwd: request.cwd,
  };
}

export function normalizeToolRequest(request: ToolExecuteRequest): ToolExecuteRequest {
  const path = request.path ?? (typeof request.args.path === "string" ? request.args.path : undefined);
  const command = request.command ?? (typeof request.args.command === "string" ? request.args.command : undefined);
  const commandArgs = request.commandArgs
    ?? (Array.isArray(request.args.args)
      ? request.args.args.filter((value): value is string => typeof value === "string")
      : undefined);
  const cwd = request.cwd ?? (typeof request.args.cwd === "string" ? request.args.cwd : undefined);
  const timeoutMs = request.timeoutMs ?? (typeof request.args.timeoutMs === "number" ? request.args.timeoutMs : undefined);
  return {
    ...request,
    path,
    command,
    commandArgs,
    cwd,
    timeoutMs,
  };
}
