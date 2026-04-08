import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ApprovalService } from "../policy/approval-service";
import { createPolicyEngine, type PolicyDecision } from "../policy/policy-engine";
import { applyPatchExecutor } from "./executors/apply-patch";
import { execExecutor } from "./executors/exec";
import { readFileExecutor } from "./executors/read-file";
import type { ToolDefinition, ToolExecuteRequest, ToolExecutionOutcome } from "./tool-types";
import { normalizeToolRequest, toPolicyRequest } from "./tool-types";
import type { ExecutionLedgerPort, ExecutionLedgerEntry } from "../../persistence/ports/execution-ledger-port";

function buildDefaultTools(): ToolDefinition[] {
  return [
    {
      name: "read_file",
      effect: "read",
      execute: readFileExecutor,
    },
    {
      name: "apply_patch",
      effect: "apply_patch",
      isEffectful: true,
      execute: applyPatchExecutor,
    },
    {
      name: "exec",
      effect: "exec",
      isEffectful: true,
      execute: execExecutor,
    },
  ];
}

function summarizeRequest(request: ToolExecuteRequest, workspaceRoot?: string): string {
  if (request.toolName === "exec" && request.command) {
    const pieces = [request.command, ...(request.commandArgs ?? [])];
    const rendered = pieces.join(" ").trim();
    return rendered.length > 0 ? `exec ${rendered}` : "exec";
  }

  let targetPath = request.path;
  if (workspaceRoot && request.path) {
    const relativePath = relative(workspaceRoot, request.path);
    if (relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath)) {
      targetPath = relativePath;
    }
  }

  const target = targetPath ? ` ${targetPath}` : "";
  const action = request.action ?? "execute";
  return `${request.toolName} ${action}${target}`;
}

export function createToolRegistry(input: {
  policy: ReturnType<typeof createPolicyEngine>;
  approvals: ApprovalService;
  executionLedger: ExecutionLedgerPort;
  tools?: ToolDefinition[];
}) {
  const tools = new Map((input.tools ?? buildDefaultTools()).map((tool) => [tool.name, tool]));
  const workspaceRootPromise = realpath(input.policy.workspaceRoot).catch(() => resolve(input.policy.workspaceRoot));

  async function pathExists(path: string): Promise<boolean> {
    return Bun.file(path).exists();
  }

  function isContained(workspaceRoot: string, path: string): boolean {
    const relativePath = relative(workspaceRoot, path);
    return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
  }

  async function resolveRealTargetPath(path: string, action?: ToolExecuteRequest["action"]): Promise<string | undefined> {
    const resolvedPath = resolve(path);

    if (action === "create_file") {
      if (await pathExists(resolvedPath)) {
        return realpath(resolvedPath);
      }

      let ancestorPath = dirname(resolvedPath);
      while (!(await pathExists(ancestorPath))) {
        const parentPath = dirname(ancestorPath);
        if (parentPath === ancestorPath) {
          return undefined;
        }

        ancestorPath = parentPath;
      }

      const realAncestorPath = await realpath(ancestorPath);
      return resolve(realAncestorPath, relative(ancestorPath, resolvedPath));
    }

    if (await pathExists(resolvedPath)) {
      return realpath(resolvedPath);
    }

    return undefined;
  }

  async function isFilesystemPathAllowed(request: ToolExecuteRequest, effect: ToolDefinition["effect"]): Promise<boolean> {
    if (!request.path || (effect !== "read" && effect !== "apply_patch" && effect !== "sensitive_write")) {
      return true;
    }

    const workspaceRoot = await workspaceRootPromise;
    const targetPath = await resolveRealTargetPath(request.path, request.action);
    if (!targetPath) {
      return true;
    }

    return isContained(workspaceRoot, targetPath);
  }

  return {
    getTool(toolName: string): ToolDefinition | undefined {
      return tools.get(toolName);
    },

    listTools(): ToolDefinition[] {
      return [...tools.values()];
    },

    async execute(request: ToolExecuteRequest): Promise<ToolExecutionOutcome> {
      const normalizedRequest = normalizeToolRequest(request);
      const tool = tools.get(normalizedRequest.toolName);
      if (!tool) {
        const decision: Extract<PolicyDecision, { kind: "deny" }> = {
          kind: "deny",
          reason: "unsupported tool request",
          risk: {
            key: `${normalizedRequest.toolName}.unknown`,
            level: "high",
            reason: "tool is not registered",
          },
        };

        return {
          kind: "denied",
          decision,
          reason: decision.reason,
        };
      }

      if (!(await isFilesystemPathAllowed(normalizedRequest, tool.effect))) {
        const decision: Extract<PolicyDecision, { kind: "deny" }> = {
          kind: "deny",
          reason: "resolved filesystem target is outside the workspace",
          risk: {
            key: `${normalizedRequest.toolName}.path_escape`,
            level: "high",
            reason: "real filesystem target escapes the workspace",
          },
        };

        return {
          kind: "denied",
          decision,
          reason: decision.reason,
        };
      }

      const decision = input.policy.evaluate(toPolicyRequest(tool, normalizedRequest));
      if (decision.kind === "deny") {
        return {
          kind: "denied",
          decision,
          reason: decision.reason,
        };
      }

      if (decision.kind === "needs_approval") {
        const workspaceRoot = await workspaceRootPromise;
        const approvalRequest = await input.approvals.createPending({
          toolCallId: normalizedRequest.toolCallId,
          threadId: normalizedRequest.threadId,
          runId: normalizedRequest.runId,
          taskId: normalizedRequest.taskId,
          toolRequest: {
            ...normalizedRequest,
            runId: normalizedRequest.runId ?? normalizedRequest.taskId,
          },
          summary: summarizeRequest(normalizedRequest, workspaceRoot),
          risk: decision.risk.key,
        });

        if (tool.isEffectful) {
          await input.executionLedger.save({
            executionId: `${normalizedRequest.toolCallId}:exec`,
            threadId: normalizedRequest.threadId,
            runId: normalizedRequest.runId,
            taskId: normalizedRequest.taskId,
            toolCallId: normalizedRequest.toolCallId,
            toolName: normalizedRequest.toolName,
            argsJson: JSON.stringify(normalizedRequest.args),
            status: "planned",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }

        return {
          kind: "blocked",
          decision,
          reason: decision.reason,
          approvalRequest,
        };
      }

      let ledgerEntry: ExecutionLedgerEntry | undefined;
      if (tool.isEffectful) {
        ledgerEntry = {
          executionId: `${normalizedRequest.toolCallId}:exec`,
          threadId: normalizedRequest.threadId,
          runId: normalizedRequest.runId,
          taskId: normalizedRequest.taskId,
          toolCallId: normalizedRequest.toolCallId,
          toolName: normalizedRequest.toolName,
          argsJson: JSON.stringify(normalizedRequest.args),
          status: "started",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await input.executionLedger.save(ledgerEntry);
      }

      try {
        const startTime = Date.now();
        const output = await tool.execute({
          ...normalizedRequest,
          request: normalizedRequest,
        });
        void (Date.now() - startTime);

        if (ledgerEntry) {
          await input.executionLedger.save({
            ...ledgerEntry,
            status: "completed",
            resultJson: JSON.stringify(output),
            updatedAt: new Date().toISOString(),
          });
        }

        return {
          kind: "executed",
          decision,
          output,
        };
      } catch (e) {
        console.error(`[TELEMETRY] tool.failed: ${normalizedRequest.toolName} - ${e}`);
        if (ledgerEntry) {
          await input.executionLedger.save({
            ...ledgerEntry,
            status: "failed",
            error: String(e),
            updatedAt: new Date().toISOString(),
          });
        }
        throw e;
      }
    },

    async executeApproved(request: ToolExecuteRequest): Promise<ToolExecutionOutcome> {
      const normalizedRequest = normalizeToolRequest(request);
      const tool = tools.get(normalizedRequest.toolName);
      if (!tool) {
        const decision: Extract<PolicyDecision, { kind: "deny" }> = {
          kind: "deny",
          reason: "unsupported tool request",
          risk: {
            key: `${normalizedRequest.toolName}.unknown`,
            level: "high",
            reason: "tool is not registered",
          },
        };

        return {
          kind: "denied",
          decision,
          reason: decision.reason,
        };
      }

      if (!(await isFilesystemPathAllowed(normalizedRequest, tool.effect))) {
        const decision: Extract<PolicyDecision, { kind: "deny" }> = {
          kind: "deny",
          reason: "resolved filesystem target is outside the workspace",
          risk: {
            key: `${normalizedRequest.toolName}.path_escape`,
            level: "high",
            reason: "real filesystem target escapes the workspace",
          },
        };

        return {
          kind: "denied",
          decision,
          reason: decision.reason,
        };
      }

      const evaluated = input.policy.evaluate(toPolicyRequest(tool, normalizedRequest));
      if (evaluated.kind === "deny") {
        return {
          kind: "denied",
          decision: evaluated,
          reason: evaluated.reason,
        };
      }

      let ledgerEntry: ExecutionLedgerEntry | undefined;
      if (tool.isEffectful) {
        ledgerEntry = {
          executionId: `${normalizedRequest.toolCallId}:exec`,
          threadId: normalizedRequest.threadId,
          runId: normalizedRequest.runId,
          taskId: normalizedRequest.taskId,
          toolCallId: normalizedRequest.toolCallId,
          toolName: normalizedRequest.toolName,
          argsJson: JSON.stringify(normalizedRequest.args),
          status: "started",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await input.executionLedger.save(ledgerEntry);
      }

      try {
        const startTime = Date.now();
        const output = await tool.execute({
          ...normalizedRequest,
          request: normalizedRequest,
        });
        const duration = Date.now() - startTime;

        if (ledgerEntry) {
          await input.executionLedger.save({
            ...ledgerEntry,
            status: "completed",
            resultJson: JSON.stringify(output),
            updatedAt: new Date().toISOString(),
          });
        }

        return {
          kind: "executed",
          decision:
            evaluated.kind === "allow"
              ? evaluated
              : {
                  kind: "allow",
                  reason: "approval granted",
                  risk: evaluated.risk,
                },
          output,
        };
      } catch (e) {
        console.error(`[TELEMETRY] tool.failed: ${normalizedRequest.toolName} - ${e}`);
        if (ledgerEntry) {
          await input.executionLedger.save({
            ...ledgerEntry,
            status: "failed",
            error: String(e),
            updatedAt: new Date().toISOString(),
          });
        }
        throw e;
      }
    },
  };
}
