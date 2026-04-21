import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ApprovalService } from "../policy/approval-service";
import { createPolicyEngine, type PolicyDecision } from "../policy/policy-engine";
import { applyPatchExecutor } from "./executors/apply-patch";
import { execExecutor } from "./executors/exec";
import { readFileExecutor } from "./executors/read-file";
import type { ToolDefinition, ToolExecuteRequest, ToolExecutionOutcome } from "./tool-types";
import { normalizeToolRequest, toPolicyRequest } from "./tool-types";
import type { ExecutionLedgerPort, ExecutionLedgerEntry } from "../../persistence/ports/execution-ledger-port";

type WorkspaceBoundaryCheck =
  | {
      kind: "inside";
    }
  | {
      kind: "outside";
      targetPath: string;
    };

/** 默认工具注册表：read_file / apply_patch / exec */
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

/** 生成审批或结果摘要：尽量把绝对路径转成 workspace 相对路径 */
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
      targetPath = relativePath.replace(/\\/g, "/");
    }
  }
  if (targetPath) {
    targetPath = targetPath.replace(/\\/g, "/");
  }

  const target = targetPath ? ` ${targetPath}` : "";
  const action = request.action ?? "execute";
  return `${request.toolName} ${action}${target}`;
}

/** 把待持久化的工具路径收敛成 workspace 相对路径，避免把宿主机绝对路径写入审批真相。 */
function toStoredRequestPath(request: ToolExecuteRequest, workspaceRoot?: string): string | undefined {
  if (!request.path) {
    return undefined;
  }

  if (!workspaceRoot || !isAbsolute(request.path)) {
    return request.path.replace(/\\/g, "/");
  }

  const relativePath = relative(workspaceRoot, request.path);
  if (relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return relativePath.replace(/\\/g, "/");
  }

  return request.path.replace(/\\/g, "/");
}

/** cwd 也需要持久化成可恢复字段，项目内优先收敛成相对路径。 */
function toStoredRequestCwd(request: ToolExecuteRequest, workspaceRoot?: string): string | undefined {
  if (!request.cwd) {
    return undefined;
  }

  if (!workspaceRoot || !isAbsolute(request.cwd)) {
    return request.cwd.replace(/\\/g, "/");
  }

  const relativePath = relative(workspaceRoot, request.cwd);
  if (relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return relativePath.replace(/\\/g, "/");
  }

  return request.cwd.replace(/\\/g, "/");
}

/** 项目外访问不再直接拒绝，而是进入高风险审批。 */
function createOutsideWorkspaceDecision(
  request: ToolExecuteRequest,
  targetPath: string,
): Extract<PolicyDecision, { kind: "needs_approval" }> {
  return {
    kind: "needs_approval",
    reason: `项目目录之外的工具目标需要用户二次确认：${targetPath}`,
    risk: {
      key: `${request.toolName}.outside_workspace`,
      level: "high",
      reason: `工具目标位于项目目录之外：${targetPath}`,
    },
  };
}

/** 创建工具注册表：负责工具发现、策略判定、审批创建与执行账本记录 */
export function createToolRegistry(input: {
  policy: ReturnType<typeof createPolicyEngine>;
  approvals: ApprovalService;
  executionLedger: ExecutionLedgerPort;
  tools?: ToolDefinition[];
}) {
  const tools = new Map((input.tools ?? buildDefaultTools()).map((tool) => [tool.name, tool]));
  const workspaceRootPromise = realpath(input.policy.workspaceRoot).catch(() => resolve(input.policy.workspaceRoot));

  /** 文件和目录都需要能被识别，避免把不存在子路径误判为项目外。 */
  async function pathExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  function isContained(workspaceRoot: string, path: string): boolean {
    const relativePath = relative(workspaceRoot, path);
    return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
  }

  /** 解析真实目标路径：写入场景尤其要防止符号链接或祖先目录逃逸 */
  async function resolveRealTargetPath(path: string, action?: ToolExecuteRequest["action"]): Promise<string | undefined> {
    const resolvedPath = resolve(path);

    if (await pathExists(resolvedPath)) {
      return realpath(resolvedPath);
    }

    // create/delete/modify/read 都可能遇到目标尚不存在或已删除的情况；
    // 使用最近存在祖先的 realpath 保持 /var 与 /private/var 等别名路径一致。
    void action;
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

  /** 路径型工具和 exec cwd 在真正执行前再次做真实文件系统边界检查。 */
  async function resolveWorkspaceBoundary(
    request: ToolExecuteRequest,
    effect: ToolDefinition["effect"],
  ): Promise<WorkspaceBoundaryCheck> {
    const workspaceRoot = await workspaceRootPromise;

    if (request.path && (effect === "read" || effect === "apply_patch" || effect === "sensitive_write")) {
      const requestedPath = isAbsolute(request.path)
        ? request.path
        : resolve(workspaceRoot, request.path);
      const targetPath = (await resolveRealTargetPath(requestedPath, request.action)) ?? resolve(requestedPath);
      if (!isContained(workspaceRoot, targetPath)) {
        return {
          kind: "outside",
          targetPath,
        };
      }
    }

    if (effect === "exec" && request.cwd) {
      const requestedCwd = isAbsolute(request.cwd)
        ? request.cwd
        : resolve(workspaceRoot, request.cwd);
      const targetPath = (await resolveRealTargetPath(requestedCwd)) ?? resolve(requestedCwd);
      if (!isContained(workspaceRoot, targetPath)) {
        return {
          kind: "outside",
          targetPath,
        };
      }
    }

    return { kind: "inside" };
  }

  async function loadCompletedEffectfulOutcome(
    request: ToolExecuteRequest,
  ): Promise<ToolExecutionOutcome | undefined> {
    const existing = await input.executionLedger.get(`${request.toolCallId}:exec`);
    if (!existing || existing.status !== "completed") {
      return undefined;
    }

    return {
      kind: "executed",
      decision: {
        kind: "allow",
        reason: "effectful tool call already completed",
        risk: {
          key: `${request.toolName}.idempotent_replay`,
          level: "low",
          reason: "completed execution ledger entry reused",
        },
      },
      output: existing.resultJson ? JSON.parse(existing.resultJson) : { ok: true },
    };
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

      const boundary = await resolveWorkspaceBoundary(normalizedRequest, tool.effect);
      if (boundary.kind === "outside") {
        const decision = createOutsideWorkspaceDecision(normalizedRequest, boundary.targetPath);
        const workspaceRoot = await workspaceRootPromise;
        const approvalRequest = await input.approvals.createPending({
          toolCallId: normalizedRequest.toolCallId,
          threadId: normalizedRequest.threadId,
          runId: normalizedRequest.runId,
          taskId: normalizedRequest.taskId,
          toolRequest: {
            ...normalizedRequest,
            runId: normalizedRequest.runId ?? normalizedRequest.taskId,
            path: toStoredRequestPath(normalizedRequest, workspaceRoot),
            cwd: toStoredRequestCwd(normalizedRequest, workspaceRoot),
            approvedOutsideWorkspaceTarget: boundary.targetPath,
          },
          summary: `项目目录之外：${summarizeRequest(normalizedRequest, workspaceRoot)} -> ${boundary.targetPath}`,
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
            path: toStoredRequestPath(normalizedRequest, workspaceRoot),
            cwd: toStoredRequestCwd(normalizedRequest, workspaceRoot),
          },
          summary: summarizeRequest(normalizedRequest, workspaceRoot),
          risk: decision.risk.key,
        });

        if (tool.isEffectful) {
          // effectful 工具在等待审批时先记录 planned，便于重启后知道“本来准备执行什么”。
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
        // effectful 工具真正执行前先写 started，保证 crash recovery 能识别不确定执行。
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
      // executeApproved 跳过策略审批分支，但仍保留工具存在性与执行账本逻辑。
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

      const boundary = await resolveWorkspaceBoundary(normalizedRequest, tool.effect);
      if (boundary.kind === "outside") {
        const approvedTarget = normalizedRequest.approvedOutsideWorkspaceTarget;
        if (!approvedTarget || approvedTarget !== boundary.targetPath) {
          const decision: Extract<PolicyDecision, { kind: "deny" }> = {
            kind: "deny",
            reason: "approved outside-workspace target does not match resolved filesystem target",
            risk: {
              key: `${normalizedRequest.toolName}.approval_target_mismatch`,
              level: "high",
              reason: `已审批目标与当前真实目标不一致：${approvedTarget ?? "<missing>"} -> ${boundary.targetPath}`,
            },
          };

          return {
            kind: "denied",
            decision,
            reason: decision.reason,
          };
        }
      }

      if (boundary.kind === "inside") {
        const evaluated = input.policy.evaluate(toPolicyRequest(tool, normalizedRequest));
        if (evaluated.kind === "deny") {
          return {
            kind: "denied",
            decision: evaluated,
            reason: evaluated.reason,
          };
        }
      }

      const evaluated = boundary.kind === "outside"
        ? {
            kind: "allow",
            reason: "approval granted for outside-workspace target",
            risk: {
              key: `${normalizedRequest.toolName}.outside_workspace_approved`,
              level: "high",
              reason: `用户已批准项目目录之外的目标：${boundary.targetPath}`,
            },
          } satisfies Extract<PolicyDecision, { kind: "allow" }>
        : input.policy.evaluate(toPolicyRequest(tool, normalizedRequest));

      if (evaluated.kind === "deny") {
        const decision: Extract<PolicyDecision, { kind: "deny" }> = {
          kind: "deny",
          reason: evaluated.reason,
          risk: evaluated.risk,
        };

        return {
          kind: "denied",
          decision,
          reason: decision.reason,
        };
      }

      let ledgerEntry: ExecutionLedgerEntry | undefined;
      if (tool.isEffectful) {
        const completedOutcome = await loadCompletedEffectfulOutcome(normalizedRequest);
        if (completedOutcome) {
          return completedOutcome;
        }

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
