import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";
import { createThread } from "../../src/domain/thread";
import { createApprovalRequest } from "../../src/domain/approval";
import { createRun, transitionRun } from "../../src/domain/run";
import { createControlTask } from "../../src/control/tasks/task-types";
import { createSqlite } from "../../src/persistence/sqlite/sqlite-client";
import { migrateSqlite } from "../../src/persistence/sqlite/sqlite-migrator";
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
    expect(ctx.config.dataDir).toBe(":memory:");
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
    expect(result.finalResponse).toBe("apply_patch create_file approved.txt");
    expect(result.executionSummary).toBe("apply_patch create_file approved.txt");
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0]?.runId).toBe(run.runId);
    expect(ledgerEntries[0]?.toolName).toBe("apply_patch");
    expect(await Bun.file(filePath).text()).toBe("approved\n");

    await closeAppContext(ctx);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  test("resumes approved delete execution through the run-loop and returns tool metadata", async () => {
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
    expect(blocked.pauseSummary).toContain("Approval required before deleting approved.txt");
    expect(approvalRequestId).toBeDefined();
    expect(interruptedRun?.status).toBe("waiting_approval");

    const resumed = await ctx.controlPlane.approveRequest(approvalRequestId!);
    const completedRun = await ctx.stores.runStore.getLatestByThread(thread.threadId);
    const ledgerEntries = await ctx.stores.executionLedger.listByThread(thread.threadId);

    expect(resumed.status).toBe("completed");
    expect(resumed.finalResponse).toBe("responded");
    expect(resumed.executionSummary).toBe("Deleted approved.txt");
    expect(resumed.lastCompletedToolCallId).toBe(`${blocked.task.taskId}:apply_patch`);
    expect(resumed.lastCompletedToolName).toBe("apply_patch");
    expect(resumed.approvals).toHaveLength(0);
    expect(completedRun?.status).toBe("completed");
    expect(ledgerEntries).toHaveLength(1);
    expect(await Bun.file(filePath).exists()).toBe(false);

    await closeAppContext(ctx);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  test("重复 approve 返回 already_resolved，而不是再次推进执行", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `openpx-approve-idempotent-${Date.now()}`);
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

    const thread = createThread("thread-approve-idempotent", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const blocked = await ctx.controlPlane.startRootTask(thread.threadId, "clean up approved artifact");
    const approvalRequestId = blocked.approvals[0]?.approvalRequestId;
    expect(approvalRequestId).toBeDefined();

    const first = await ctx.controlPlane.approveRequest(approvalRequestId!);
    const second = await ctx.controlPlane.approveRequest(approvalRequestId!);

    expect(first.status).toBe("completed");
    expect(second.resumeDisposition).toBe("already_resolved");
    expect(second.status).toBe("completed");

    await closeAppContext(ctx);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  test("invalidates legacy checkpoint-backed threads on boot", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `openpx-reject-run-${Date.now()}`);
    const dataDir = path.join(workspaceRoot, "openpx.db");
    const filePath = path.join(workspaceRoot, "src", "legacy-delete.ts");

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "export const legacyDelete = true;\n");

    const seedDb = createSqlite(dataDir);
    migrateSqlite(seedDb);
    seedDb.run(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        type TEXT,
        checkpoint BLOB,
        metadata BLOB,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
      )
    `);
    seedDb.run(`
      CREATE TABLE IF NOT EXISTS writes (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        channel TEXT NOT NULL,
        type TEXT,
        value BLOB,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
      )
    `);
    const thread = createThread("thread-reject", workspaceRoot, "openpx");
    seedDb.run(
      `INSERT INTO threads (thread_id, workspace_root, project_id, revision, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [thread.threadId, workspaceRoot, "openpx", 1, "active", new Date().toISOString()],
    );
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
    seedDb.run(
      `INSERT INTO runs (run_id, thread_id, status, trigger, input_text, active_task_id, started_at, blocking_reason_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        run.runId,
        thread.threadId,
        run.status,
        run.trigger,
        run.inputText ?? null,
        "task-reject",
        run.startedAt,
        JSON.stringify({
          kind: "waiting_approval",
          message: "apply_patch delete_file src/legacy-delete.ts",
        }),
      ],
    );
    seedDb.run(
      `INSERT INTO tasks (task_id, thread_id, run_id, summary, status, blocking_reason_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        "task-reject",
        thread.threadId,
        run.runId,
        "Delete legacy file",
        "blocked",
        JSON.stringify({
          kind: "waiting_approval",
          message: "apply_patch delete_file src/legacy-delete.ts",
        }),
      ],
    );
    seedDb.run(
      `INSERT INTO approvals (approval_request_id, thread_id, run_id, task_id, tool_call_id, request_json, summary, risk, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "approval-reject",
        thread.threadId,
        run.runId,
        "task-reject",
        "task-reject:apply_patch",
        JSON.stringify(
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
          }).toolRequest,
        ),
        "apply_patch delete_file src/legacy-delete.ts",
        "apply_patch.delete_file",
        "pending",
      ],
    );
    seedDb.run(
      `INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)
       VALUES (?, '', ?, NULL, 'json', x'7B7D', x'7B7D')`,
      [thread.threadId, "checkpoint_1"],
    );
    seedDb.close();

    const ctx = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: createTestModelGateway(),
    });

    const latestRun = await ctx.stores.runStore.getLatestByThread(thread.threadId);
    const tasks = await ctx.stores.taskStore.listByThread(thread.threadId);
    const remainingCheckpoints = createSqlite(dataDir)
      .query<{ count: number }, [string]>("SELECT COUNT(*) as count FROM checkpoints WHERE thread_id = ?")
      .get(thread.threadId);

    expect(latestRun?.status).toBe("blocked");
    expect(latestRun?.blockingReason?.kind).toBe("human_recovery");
    expect(tasks.at(-1)?.status).toBe("blocked");
    expect(tasks.at(-1)?.blockingReason?.kind).toBe("human_recovery");
    expect(remainingCheckpoints?.count).toBe(0);

    await closeAppContext(ctx);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  test("replans rejected delete capability without reusing the same marker", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `openpx-reject-replan-marker-${Date.now()}`);
    const dataDir = path.join(workspaceRoot, "openpx.db");
    const filePath = path.join(workspaceRoot, "src", "approval-target.ts");

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "export const approvalTarget = true;\n");

    let planCalls = 0;
    const modelGateway = {
      async plan() {
        planCalls += 1;
        if (planCalls === 1) {
          return {
            summary: "Plan a scoped delete that requires approval.",
            plannerResult: {
              workPackages: [
                {
                  id: "pkg_delete",
                  objective: "Delete src/approval-target.ts after explicit approval",
                  capabilityMarker: "apply_patch.delete_file" as const,
                  capabilityFamily: "reject_replan_delete" as const,
                  requiresApproval: true,
                  replanHint: "avoid_same_capability_marker" as const,
                  allowedTools: ["apply_patch"],
                  inputRefs: ["thread:goal", "file:src/approval-target.ts"],
                  expectedArtifacts: ["patch:src/approval-target.ts"],
                },
              ],
              acceptanceCriteria: ["approval-target.ts is removed only after approval"],
              riskFlags: [],
              approvalRequiredActions: ["apply_patch.delete_file"],
              verificationScope: ["workspace file state"],
            },
          };
        }

        return {
          summary: "Continue safely without deleting files.",
          plannerResult: {
            workPackages: [
                {
                  id: "pkg_safe_replan",
                  objective: "continue safely without deleting files",
                  capabilityMarker: "respond_only" as const,
                  capabilityFamily: "reject_replan_delete" as const,
                  requiresApproval: false,
                  replanHint: "avoid_same_capability_marker" as const,
                  allowedTools: ["read_file"],
                  inputRefs: ["thread:goal"],
                  expectedArtifacts: ["response:safe-replan"],
              },
            ],
            acceptanceCriteria: ["no file deletion occurs after rejection"],
            riskFlags: [],
            approvalRequiredActions: [],
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

    const thread = createThread("thread-reject-replan-marker", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const blocked = await ctx.controlPlane.startRootTask(
      thread.threadId,
      "Delete src/approval-target.ts, but if I reject it then continue safely without deleting files.",
    );
    const approvalRequestId = blocked.approvals[0]?.approvalRequestId;

    expect(blocked.status).toBe("waiting_approval");
    expect(approvalRequestId).toBeDefined();

    const result = await ctx.controlPlane.rejectRequest(approvalRequestId!);

    expect(result.status).toBe("completed");
    expect(result.finalResponse).toBe("responded");
    expect(result.executionSummary).toContain("continue safely without deleting files");
    expect(result.executionSummary).not.toContain("rejected for proposal");
    expect(await Bun.file(filePath).exists()).toBe(true);

    await closeAppContext(ctx);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  test("restart_run 为 human_recovery 创建新的 run，并清掉旧恢复锚点", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `openpx-restart-run-${Date.now()}`);
    const dataDir = path.join(workspaceRoot, "openpx.db");

    await fs.mkdir(workspaceRoot, { recursive: true });

    const ctx = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: createTestModelGateway(),
    });

    const thread = createThread("thread-restart", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);
    const run = transitionRun(
      transitionRun(
        createRun({
          runId: "run-restart",
          threadId: thread.threadId,
          trigger: "system_resume",
          inputText: "retry previous intent",
        }),
        "running",
      ),
      "blocked",
    );
    await ctx.stores.runStore.save({
      ...run,
      activeTaskId: "task-restart",
      blockingReason: {
        kind: "human_recovery",
        message: "Manual recovery required.",
      },
    });
    await ctx.stores.taskStore.save({
      taskId: "task-restart",
      threadId: thread.threadId,
      runId: run.runId,
      summary: "Recover blocked run",
      status: "blocked",
      blockingReason: {
        kind: "human_recovery",
        message: "Manual recovery required.",
      },
    });
    await ctx.stores.runStateStore.saveState({
      stateVersion: 1,
      engineVersion: "run-loop-v1",
      threadId: thread.threadId,
      runId: run.runId,
      taskId: "task-restart",
      input: "retry previous intent",
      nextStep: "execute",
      artifacts: [],
      latestArtifacts: [],
    });

    const restarted = await ctx.controlPlane.restartRun(thread.threadId);
    const runs = await ctx.stores.runStore.listByThread(thread.threadId);
    const oldState = await ctx.stores.runStateStore.loadByRun(run.runId);

    expect(restarted.status).toBe("completed");
    expect(runs).toHaveLength(2);
    expect(runs[0]?.runId).toBe(run.runId);
    expect(runs[0]?.status).toBe("interrupted");
    expect(runs[1]?.runId).not.toBe(run.runId);
    expect(oldState).toBeUndefined();

    await closeAppContext(ctx);
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

});
