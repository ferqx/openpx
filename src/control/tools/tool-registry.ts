import type { ApprovalService } from "../policy/approval-service";
import { createPolicyEngine, type PolicyDecision } from "../policy/policy-engine";
import { applyPatchExecutor } from "./executors/apply-patch";
import { execExecutor } from "./executors/exec";
import { readFileExecutor } from "./executors/read-file";
import type { ToolDefinition, ToolExecuteRequest, ToolExecutionOutcome } from "./tool-types";
import { toPolicyRequest } from "./tool-types";

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
      execute: applyPatchExecutor,
    },
    {
      name: "exec",
      effect: "exec",
      execute: execExecutor,
    },
  ];
}

function summarizeRequest(request: ToolExecuteRequest): string {
  const target = request.path ? ` ${request.path}` : "";
  const action = request.action ?? "execute";
  return `${request.toolName} ${action}${target}`;
}

export function createToolRegistry(input: {
  policy: ReturnType<typeof createPolicyEngine>;
  approvals: ApprovalService;
  tools?: ToolDefinition[];
}) {
  const tools = new Map((input.tools ?? buildDefaultTools()).map((tool) => [tool.name, tool]));

  return {
    getTool(toolName: string): ToolDefinition | undefined {
      return tools.get(toolName);
    },

    listTools(): ToolDefinition[] {
      return [...tools.values()];
    },

    async execute(request: ToolExecuteRequest): Promise<ToolExecutionOutcome> {
      const tool = tools.get(request.toolName);
      if (!tool) {
        const decision: Extract<PolicyDecision, { kind: "deny" }> = {
          kind: "deny",
          reason: "unsupported tool request",
          risk: {
            key: `${request.toolName}.unknown`,
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

      const decision = input.policy.evaluate(toPolicyRequest(tool, request));
      if (decision.kind === "deny") {
        return {
          kind: "denied",
          decision,
          reason: decision.reason,
        };
      }

      if (decision.kind === "needs_approval") {
        const approvalRequest = await input.approvals.createPending({
          toolCallId: request.toolCallId,
          threadId: request.threadId,
          taskId: request.taskId,
          summary: summarizeRequest(request),
          risk: decision.risk.key,
        });

        return {
          kind: "blocked",
          decision,
          reason: decision.reason,
          approvalRequest,
        };
      }

      const output = await tool.execute({
        ...request,
        request,
      });
      return {
        kind: "executed",
        decision,
        output,
      };
    },
  };
}
