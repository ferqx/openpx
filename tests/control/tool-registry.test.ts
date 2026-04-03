import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createApprovalService } from "../../src/control/policy/approval-service";
import { createPolicyEngine } from "../../src/control/policy/policy-engine";
import { applyPatchExecutor } from "../../src/control/tools/executors/apply-patch";
import { createToolRegistry } from "../../src/control/tools/tool-registry";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createWorkspace() {
  const dir = await mkdtemp(join(tmpdir(), "tool-registry-"));
  tempDirs.push(dir);
  return dir;
}

describe("ToolRegistry", () => {
  test("executes allowed apply_patch modifications against the real filesystem", async () => {
    const workspaceRoot = await createWorkspace();
    const filePath = join(workspaceRoot, "src/app/main.ts");
    await Bun.write(filePath, "before\n");

    const policy = createPolicyEngine({ workspaceRoot });
    const approvals = createApprovalService();
    const executionLedger = {
      async save() {},
      async get() { return undefined },
      async listByThread() { return [] },
      async findUncertain() { return [] },
      async close() {},
    };
    const registry = createToolRegistry({
      policy,
      approvals,
      executionLedger,
    });

    const result = await registry.execute({
      toolCallId: "tool_1",
      threadId: "thread_1",
      taskId: "task_1",
      toolName: "apply_patch",
      action: "modify_file",
      path: filePath,
      changedFiles: 1,
      args: { content: "after\n" },
    });

    expect(result.kind).toBe("executed");
    if (result.kind === "executed") {
      expect(result.output).toMatchObject({
        ok: true,
        action: "modify_file",
        path: filePath,
      });
    }

    expect(await Bun.file(filePath).text()).toBe("after\n");
  });

  test("blocks approval-gated tool calls and creates an approval request", async () => {
    const workspaceRoot = await createWorkspace();
    const filePath = join(workspaceRoot, "src/app/main.ts");
    await Bun.write(filePath, "keep\n");

    const policy = createPolicyEngine({ workspaceRoot });
    const approvals = createApprovalService();
    const executionLedger = {
      async save() {},
      async get() { return undefined },
      async listByThread() { return [] },
      async findUncertain() { return [] },
      async close() {},
    };
    const registry = createToolRegistry({ policy, approvals, executionLedger });

    const result = await registry.execute({
      toolCallId: "tool_2",
      threadId: "thread_1",
      taskId: "task_1",
      toolName: "apply_patch",
      action: "delete_file",
      path: filePath,
      changedFiles: 1,
      args: {},
    });

    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.reason).toContain("delete_file");
      expect(result.approvalRequest.status).toBe("pending");
    }

    const pending = await approvals.listPendingByThread("thread_1");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.toolCallId).toBe("tool_2");
    expect(await Bun.file(filePath).text()).toBe("keep\n");
  });

  test("denies unsafe outside-workspace apply_patch requests", async () => {
    const workspaceRoot = await createWorkspace();
    const outsideFile = `${workspaceRoot}-evil/outside.ts`;

    const policy = createPolicyEngine({ workspaceRoot });
    const approvals = createApprovalService();
    const executionLedger = {
      async save() {},
      async get() { return undefined },
      async listByThread() { return [] },
      async findUncertain() { return [] },
      async close() {},
    };
    const registry = createToolRegistry({ policy, approvals, executionLedger });

    const result = await registry.execute({
      toolCallId: "tool_3",
      threadId: "thread_1",
      taskId: "task_1",
      toolName: "apply_patch",
      action: "modify_file",
      path: outsideFile,
      changedFiles: 1,
      args: { content: "nope\n" },
    });

    expect(result.kind).toBe("denied");
    expect(await Bun.file(outsideFile).exists()).toBe(false);
  });

  test("denies symlink escapes that resolve outside the workspace", async () => {
    const workspaceRoot = await createWorkspace();
    const outsideRoot = await createWorkspace();
    const outsideFile = join(outsideRoot, "escaped.ts");
    const symlinkPath = join(workspaceRoot, "src/escaped.ts");
    await Bun.write(outsideFile, "before\n");
    await mkdir(dirname(symlinkPath), { recursive: true });
    await symlink(outsideFile, symlinkPath);

    const policy = createPolicyEngine({ workspaceRoot });
    const approvals = createApprovalService();
    const executionLedger = {
      async save() {},
      async get() { return undefined },
      async listByThread() { return [] },
      async findUncertain() { return [] },
      async close() {},
    };
    const registry = createToolRegistry({ policy, approvals, executionLedger });

    const result = await registry.execute({
      toolCallId: "tool_symlink",
      threadId: "thread_1",
      taskId: "task_1",
      toolName: "apply_patch",
      action: "modify_file",
      path: symlinkPath,
      changedFiles: 1,
      args: { content: "after\n" },
    });

    expect(result.kind).toBe("denied");
    expect(await Bun.file(outsideFile).text()).toBe("before\n");
  });

  test("executes in-workspace read_file requests when the path is provided in args", async () => {
    const workspaceRoot = await createWorkspace();
    const filePath = join(workspaceRoot, "src/readme.ts");
    await Bun.write(filePath, "console.log('ok');\n");

    const policy = createPolicyEngine({ workspaceRoot });
    const approvals = createApprovalService();
    const executionLedger = {
      async save() {},
      async get() { return undefined },
      async listByThread() { return [] },
      async findUncertain() { return [] },
      async close() {},
    };
    const registry = createToolRegistry({ policy, approvals, executionLedger });

    const result = await registry.execute({
      toolCallId: "tool_read",
      threadId: "thread_1",
      taskId: "task_1",
      toolName: "read_file",
      args: { path: filePath },
    });

    expect(result.kind).toBe("executed");
    if (result.kind === "executed") {
      expect(result.output).toEqual({
        path: filePath,
        content: "console.log('ok');\n",
      });
    }
  });
});

describe("applyPatchExecutor", () => {
  test("creates files for create_file", async () => {
    const workspaceRoot = await createWorkspace();
    const filePath = join(workspaceRoot, "src/new-file.ts");

    const result = await applyPatchExecutor({
      toolCallId: "tool_4",
      threadId: "thread_1",
      taskId: "task_1",
      toolName: "apply_patch",
      path: filePath,
      action: "create_file",
      changedFiles: 1,
      args: { content: "export const value = 1;\n" },
      request: {
        toolCallId: "tool_4",
        threadId: "thread_1",
        taskId: "task_1",
        toolName: "apply_patch",
        path: filePath,
        action: "create_file",
        changedFiles: 1,
        args: { content: "export const value = 1;\n" },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      action: "create_file",
      path: filePath,
    });
    expect(await readFile(filePath, "utf8")).toBe("export const value = 1;\n");
  });

  test("deletes files for delete_file", async () => {
    const workspaceRoot = await createWorkspace();
    const filePath = join(workspaceRoot, "src/delete-me.ts");
    await mkdir(dirname(filePath), { recursive: true });
    await Bun.write(filePath, "remove me\n");

    const result = await applyPatchExecutor({
      toolCallId: "tool_5",
      threadId: "thread_1",
      taskId: "task_1",
      toolName: "apply_patch",
      path: filePath,
      action: "delete_file",
      changedFiles: 1,
      args: {},
      request: {
        toolCallId: "tool_5",
        threadId: "thread_1",
        taskId: "task_1",
        toolName: "apply_patch",
        path: filePath,
        action: "delete_file",
        changedFiles: 1,
        args: {},
      },
    });

    expect(result).toMatchObject({
      ok: true,
      action: "delete_file",
      path: filePath,
    });

    await expect(unlink(filePath)).rejects.toThrow();
  });

  test("rejects create_file when the destination already exists", async () => {
    const workspaceRoot = await createWorkspace();
    const filePath = join(workspaceRoot, "src/existing.ts");
    await mkdir(dirname(filePath), { recursive: true });
    await Bun.write(filePath, "already here\n");

    await expect(
      applyPatchExecutor({
        toolCallId: "tool_6",
        threadId: "thread_1",
        taskId: "task_1",
        toolName: "apply_patch",
        path: filePath,
        action: "create_file",
        changedFiles: 1,
        args: { content: "new value\n" },
        request: {
          toolCallId: "tool_6",
          threadId: "thread_1",
          taskId: "task_1",
          toolName: "apply_patch",
          path: filePath,
          action: "create_file",
          changedFiles: 1,
          args: { content: "new value\n" },
        },
      }),
    ).rejects.toThrow();

    expect(await Bun.file(filePath).text()).toBe("already here\n");
  });
});
