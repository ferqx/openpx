import { describe, expect, test } from "bun:test";
import { createApprovalService } from "../../src/control/policy/approval-service";
import { createPolicyEngine } from "../../src/control/policy/policy-engine";
import { createToolRegistry } from "../../src/control/tools/tool-registry";

describe("ToolRegistry", () => {
  test("executes allowed tool calls", async () => {
    const policy = createPolicyEngine({ workspaceRoot: "/repo" });
    const approvals = createApprovalService();
    const registry = createToolRegistry({
      policy,
      approvals,
      tools: [
        {
          name: "apply_patch",
          effect: "apply_patch",
          execute: async (input) => ({
            ok: true,
            patch: input.args.patch,
          }),
        },
      ],
    });

    const result = await registry.execute({
      toolCallId: "tool_1",
      threadId: "thread_1",
      taskId: "task_1",
      toolName: "apply_patch",
      action: "modify_file",
      path: "/repo/src/app/main.ts",
      changedFiles: 1,
      args: { patch: "*** Begin Patch" },
    });

    expect(result.kind).toBe("executed");
    if (result.kind === "executed") {
      expect(result.output).toEqual({
        ok: true,
        patch: "*** Begin Patch",
      });
    }
  });

  test("blocks approval-gated tool calls and creates an approval request", async () => {
    const policy = createPolicyEngine({ workspaceRoot: "/repo" });
    const approvals = createApprovalService();
    const registry = createToolRegistry({
      policy,
      approvals,
      tools: [
        {
          name: "apply_patch",
          effect: "apply_patch",
          execute: async () => {
            throw new Error("should not execute");
          },
        },
      ],
    });

    const result = await registry.execute({
      toolCallId: "tool_2",
      threadId: "thread_1",
      taskId: "task_1",
      toolName: "apply_patch",
      action: "delete_file",
      path: "/repo/src/app/main.ts",
      changedFiles: 1,
      args: { patch: "*** Delete File: src/app/main.ts" },
    });

    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.reason).toContain("delete_file");
      expect(result.approvalRequest.status).toBe("pending");
    }

    const pending = await approvals.listPendingByThread("thread_1");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.toolCallId).toBe("tool_2");
  });
});
