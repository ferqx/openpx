import type { ApprovalRequest } from "../../domain/approval";
import type { PolicyDecision, PolicyRequest } from "../policy/policy-engine";
import type { PatchAction, ToolEffect } from "../policy/risk-model";

/** 规范化后的工具执行请求：tool-registry / approval / ledger 共用 */
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
  approvedOutsideWorkspaceTarget?: string;
  action?: PatchAction;
  changedFiles?: number;
};

/** 传给具体 executor 的上下文：保留 request 原文，同时平铺常用字段 */
export type ToolExecutionContext = {
  request: ToolExecuteRequest;
} & ToolExecuteRequest;

/** 具体工具执行器接口 */
export type ToolExecutor = (context: ToolExecutionContext) => Promise<unknown>;

/** 工具定义：名称、副作用类别以及真实执行函数 */
export type ToolDefinition = {
  name: string;
  effect: ToolEffect;
  isEffectful?: boolean;
  execute: ToolExecutor;
};

/** 工具执行结果：已执行、被审批阻塞或被策略拒绝 */
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

/** 把工具请求映射到 policy engine 的统一风险评估输入 */
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

/** 从 args 中回填 path/command/cwd 等常用字段，得到稳定的规范化请求 */
export function normalizeToolRequest(request: ToolExecuteRequest): ToolExecuteRequest {
  const path = request.path ?? (typeof request.args.path === "string" ? request.args.path : undefined);
  const command = request.command ?? (typeof request.args.command === "string" ? request.args.command : undefined);
  const commandArgs = request.commandArgs
    ?? (Array.isArray(request.args.args)
      ? request.args.args.filter((value): value is string => typeof value === "string")
      : undefined);
  const cwd = request.cwd ?? (typeof request.args.cwd === "string" ? request.args.cwd : undefined);
  const timeoutMs = request.timeoutMs ?? (typeof request.args.timeoutMs === "number" ? request.args.timeoutMs : undefined);
  const approvedOutsideWorkspaceTarget = request.approvedOutsideWorkspaceTarget
    ?? (typeof request.args.approvedOutsideWorkspaceTarget === "string"
      ? request.args.approvedOutsideWorkspaceTarget
      : undefined);
  return {
    ...request,
    path,
    command,
    commandArgs,
    cwd,
    timeoutMs,
    approvedOutsideWorkspaceTarget,
  };
}
