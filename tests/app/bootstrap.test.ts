import { describe, expect, test } from "bun:test";
import { interrupt } from "@langchain/langgraph";
import { createAppContext } from "../../src/app/bootstrap";
import { createThread } from "../../src/domain/thread";
import { createApprovalRequest } from "../../src/domain/approval";
import { createRun, transitionRun } from "../../src/domain/run";
import { createControlTask } from "../../src/control/tasks/task-types";
import { createSqliteCheckpointer } from "../../src/persistence/sqlite/sqlite-checkpointer";
import { createRootGraph } from "../../src/runtime/graph/root/graph";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

async function closeAppContext(ctx: Awaited<ReturnType<typeof createAppContext>>) {
  await ctx.close();
}

function createTestModelGateway() {
  return {
    async plan() {
      return { summary: "plan" };
    },
    async execute() {
      return { kind: "no_tool" as const, summary: "executed" };
    },
    async verify() {
      return { summary: "verified", isValid: true };
    },
    async respond() {
      return { summary: "responded" };
    },
    onStatusChange() {
      return () => {};
    },
    onEvent() {
      return () => {};
    },
  };
}

describe("createAppContext", () => {
  test("builds a local sqlite-backed app context", async () => {
    const ctx = await createAppContext({
      workspaceRoot: "/tmp/demo-workspace",
      dataDir: ":memory:",
      modelGateway: createTestModelGateway(),
    });

    expect(ctx.config.workspaceRoot).toBe(path.resolve("/tmp/demo-workspace"));
    expect(ctx.config.checkpointConnString).toBe(":memory:");
    expect(ctx.config.model).toBeDefined();
    expect(typeof ctx.kernel.handleCommand).toBe("function");

    await closeAppContext(ctx);
  });

  test("rehydrates durable thread narrative summaries across app boots", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `openpx-narrative-${Date.now()}`);
    const dataDir = path.join(workspaceRoot, "openpx.db");

    await fs.mkdir(workspaceRoot, { recursive: true });

    const first = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: createTestModelGateway(),
    });

    const thread = createThread("thread-persisted", workspaceRoot, first.config.projectId);
    await first.stores.threadStore.save(thread);
    await first.narrativeService.processTaskUpdate(
      createControlTask({
        taskId: "task-1",
        threadId: thread.threadId,
        summary: "Completed repo scan and isolated runtime recovery work.",
        status: "completed",
      }),
    );

    const second = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: createTestModelGateway(),
    });

    const narrative = await second.narrativeService.getNarrative(thread.threadId);
    expect(narrative.summary).toContain("Completed repo scan and isolated runtime recovery work.");
    expect(narrative.revision).toBe(1);

    await closeAppContext(first);
    await closeAppContext(second);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  test("persists a run lifecycle record when starting root work", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `openpx-run-lifecycle-${Date.now()}`);
    const dataDir = path.join(workspaceRoot, "openpx.db");

    await fs.mkdir(workspaceRoot, { recursive: true });

    const ctx = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: createTestModelGateway(),
    });

    const thread = createThread("thread-run", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const result = await ctx.controlPlane.startRootTask(thread.threadId, "what is my name?");
    const runs = await ctx.stores.runStore.listByThread(thread.threadId);

    expect(result.status).toBe("completed");
    expect(runs).toHaveLength(1);
    expect(runs[0]?.threadId).toBe(thread.threadId);
    expect(runs[0]?.activeTaskId).toBe(result.task.taskId);
    expect(runs[0]?.status).toBe("completed");
    expect(runs[0]?.inputText).toBe("what is my name?");

    await closeAppContext(ctx);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  test("advances an existing run when an approval is approved", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `openpx-approve-run-${Date.now()}`);
    const dataDir = path.join(workspaceRoot, "openpx.db");
    const filePath = path.join(workspaceRoot, "approved.txt");

    await fs.mkdir(workspaceRoot, { recursive: true });

    const ctx = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: createTestModelGateway(),
    });

    const thread = createThread("thread-approve", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const run = transitionRun(
      transitionRun(
        createRun({
          runId: "run-approve",
          threadId: thread.threadId,
          trigger: "approval_resume",
          inputText: "approve patch",
        }),
        "running",
      ),
      "waiting_approval",
    );
    await ctx.stores.runStore.save({
      ...run,
      activeTaskId: "task-approve",
      blockingReason: {
        kind: "waiting_approval",
        message: "apply_patch create_file approved.txt",
      },
    });
    await ctx.stores.taskStore.save({
      taskId: "task-approve",
      threadId: thread.threadId,
      runId: run.runId,
      summary: "Create approved file",
      status: "blocked",
      blockingReason: {
        kind: "waiting_approval",
        message: "apply_patch create_file approved.txt",
      },
    });
    await ctx.stores.approvalStore.save(
      createApprovalRequest({
        approvalRequestId: "approval-approve",
        threadId: thread.threadId,
        runId: run.runId,
        taskId: "task-approve",
        toolCallId: "tool-approve",
        toolRequest: {
          toolCallId: "tool-approve",
          threadId: thread.threadId,
          runId: run.runId,
          taskId: "task-approve",
          toolName: "apply_patch",
          args: { content: "approved\n" },
          action: "create_file",
          path: filePath,
          changedFiles: 1,
        },
        summary: "apply_patch create_file approved.txt",
        risk: "apply_patch.create_file",
      }),
    );

    const result = await ctx.controlPlane.approveRequest("approval-approve");
    const updatedRun = await ctx.stores.runStore.get(run.runId);
    const ledgerEntries = await ctx.stores.executionLedger.listByThread(thread.threadId);

    expect(result.status).toBe("completed");
    expect(updatedRun?.runId).toBe(run.runId);
    expect(updatedRun?.status).toBe("completed");
    expect(updatedRun?.activeTaskId).toBe("task-approve");
    expect(result.summary).toBe("apply_patch create_file approved.txt");
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0]?.runId).toBe(run.runId);
    expect(ledgerEntries[0]?.toolName).toBe("apply_patch");
    expect(await Bun.file(filePath).text()).toBe("approved\n");

    await closeAppContext(ctx);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  test("resumes approved delete execution through the graph and returns tool metadata", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `openpx-approve-resume-${Date.now()}`);
    const dataDir = path.join(workspaceRoot, "openpx.db");
    const filePath = path.join(workspaceRoot, "approved.txt");

    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(filePath, "approved\n");

    const modelGateway = {
      async plan() {
        return {
          summary: "plan delete",
          plannerResult: {
            workPackages: [
              {
                id: "pkg_delete",
                objective: "delete approved.txt",
                allowedTools: ["apply_patch"],
                inputRefs: ["thread:goal", "file:approved.txt"],
                expectedArtifacts: ["patch:approved.txt"],
              },
            ],
            acceptanceCriteria: ["approved.txt is removed"],
            riskFlags: [],
            approvalRequiredActions: ["apply_patch.delete_file"],
            verificationScope: ["workspace file state"],
          },
        };
      },
      async verify() {
        return { summary: "verified", isValid: true };
      },
      async respond() {
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const ctx = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway,
    });

    const thread = createThread("thread-approve-resume", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const blocked = await ctx.controlPlane.startRootTask(thread.threadId, "clean up approved artifact");
    const approvalRequestId = blocked.approvals[0]?.approvalRequestId;
    const interruptedRun = await ctx.stores.runStore.getLatestByThread(thread.threadId);

    expect(blocked.status).toBe("waiting_approval");
    expect(blocked.summary).toContain("Approval required before deleting approved.txt");
    expect(approvalRequestId).toBeDefined();
    expect(interruptedRun?.status).toBe("waiting_approval");

    const resumed = await ctx.controlPlane.approveRequest(approvalRequestId!);
    const completedRun = await ctx.stores.runStore.getLatestByThread(thread.threadId);
    const ledgerEntries = await ctx.stores.executionLedger.listByThread(thread.threadId);

    expect(resumed.status).toBe("completed");
    expect(resumed.summary).toBe("Deleted approved.txt");
    expect(resumed.lastCompletedToolCallId).toBe(`${blocked.task.taskId}:apply_patch`);
    expect(resumed.lastCompletedToolName).toBe("apply_patch");
    expect(resumed.approvals).toHaveLength(0);
    expect(completedRun?.status).toBe("completed");
    expect(ledgerEntries).toHaveLength(1);
    expect(await Bun.file(filePath).exists()).toBe(false);

    await closeAppContext(ctx);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  test("routes graph-backed rejections back through planning with a synthesized reason", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `openpx-reject-run-${Date.now()}`);
    const dataDir = path.join(workspaceRoot, "openpx.db");
    const filePath = path.join(workspaceRoot, "src", "legacy-delete.ts");

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "export const legacyDelete = true;\n");

    const checkpointSaver = createSqliteCheckpointer(dataDir);
    const checkpointGraph = await createRootGraph({
      checkpointer: checkpointSaver,
      planner: async () => ({ summary: "planned", mode: "plan" }),
      executor: async () => {
        interrupt({
          kind: "approval-required",
          mode: "execute",
          summary: "Approval required before deleting src/legacy-delete.ts",
        });
        return { summary: "unreachable", mode: "execute" };
      },
      verifier: async () => ({ summary: "verified", mode: "verify", isValid: true }),
    });

    await checkpointGraph.invoke(
      {
        input: "continue",
        workPackages: [
          {
            id: "pkg_delete",
            objective: "delete src/legacy-delete.ts",
            allowedTools: ["apply_patch"],
            inputRefs: ["thread:goal", "file:src/legacy-delete.ts"],
            expectedArtifacts: ["patch:src/legacy-delete.ts"],
          },
        ],
        currentWorkPackageId: "pkg_delete",
      },
      { configurable: { thread_id: "thread-reject", task_id: "task-reject" } },
    );
    await (checkpointSaver as { close?: () => Promise<void> }).close?.();

    const modelGateway = {
      async plan(input: { prompt: string }) {
        return { summary: input.prompt };
      },
      async verify() {
        return { summary: "verified", isValid: true };
      },
      async respond() {
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const ctx = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway,
    });

    const thread = createThread("thread-reject", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);
    const run = transitionRun(
      transitionRun(
        createRun({
          runId: "run-reject",
          threadId: thread.threadId,
          trigger: "approval_resume",
          inputText: "reject patch",
        }),
        "running",
      ),
      "waiting_approval",
    );
    await ctx.stores.runStore.save({
      ...run,
      activeTaskId: "task-reject",
      blockingReason: {
        kind: "waiting_approval",
        message: "apply_patch delete_file src/legacy-delete.ts",
      },
    });
    await ctx.stores.taskStore.save({
      taskId: "task-reject",
      threadId: thread.threadId,
      runId: run.runId,
      summary: "Delete legacy file",
      status: "blocked",
      blockingReason: {
        kind: "waiting_approval",
        message: "apply_patch delete_file src/legacy-delete.ts",
      },
    });
    await ctx.stores.approvalStore.save(
      createApprovalRequest({
        approvalRequestId: "approval-reject",
        threadId: thread.threadId,
        runId: run.runId,
        taskId: "task-reject",
        toolCallId: "task-reject:apply_patch",
        toolRequest: {
          toolCallId: "task-reject:apply_patch",
          threadId: thread.threadId,
          runId: run.runId,
          taskId: "task-reject",
          toolName: "apply_patch",
          args: {},
          action: "delete_file",
          path: filePath,
          changedFiles: 1,
        },
        summary: "apply_patch delete_file src/legacy-delete.ts",
        risk: "apply_patch.delete_file",
      }),
    );

    const result = await ctx.controlPlane.rejectRequest("approval-reject");

    expect(result.status).toBe("completed");
    expect(result.summary).toContain("Tool approval was rejected for proposal");
    expect(result.summary).toContain("Replan safely without repeating that proposal.");
    expect(result.approvals).toHaveLength(0);
    expect(await Bun.file(filePath).exists()).toBe(true);

    await closeAppContext(ctx);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

});
