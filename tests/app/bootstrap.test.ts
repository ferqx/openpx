import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";
import { createThread } from "../../src/domain/thread";
import { createApprovalRequest } from "../../src/domain/approval";
import { createRun, transitionRun } from "../../src/domain/run";
import { createControlTask } from "../../src/control/tasks/task-types";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

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

    expect(ctx.config.workspaceRoot).toBe("/tmp/demo-workspace");
    expect(ctx.config.checkpointConnString).toBe(":memory:");
    expect(ctx.config.model).toBeDefined();
    expect(typeof ctx.kernel.handleCommand).toBe("function");
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
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0]?.runId).toBe(run.runId);
    expect(ledgerEntries[0]?.toolName).toBe("apply_patch");
    expect(await Bun.file(filePath).text()).toBe("approved\n");

    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

});
