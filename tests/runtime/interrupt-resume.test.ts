import { afterEach, describe, expect, test } from "bun:test";
import { Command, INTERRUPT, MemorySaver, isInterrupted } from "@langchain/langgraph";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppContext } from "../../src/app/bootstrap";
import { createSqlite } from "../../src/persistence/sqlite/sqlite-client";
import { migrateSqlite } from "../../src/persistence/sqlite/sqlite-migrator";
import { createRootGraph } from "../../src/runtime/graph/root/graph";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createWorkspace() {
  const dir = await mkdtemp(join(tmpdir(), "interrupt-resume-"));
  tempDirs.push(dir);
  return dir;
}

async function closeAppContext(ctx: Awaited<ReturnType<typeof createAppContext>>) {
  await ctx.close();
}

async function waitFor<T>(load: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 500): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await load();
    if (predicate(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return load();
}

function createTestModelGateway() {
  return {
    async plan(input: { prompt: string }) {
      return { summary: `planned: ${input.prompt}` };
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
      return () => undefined;
    },
    onEvent() {
      return () => undefined;
    },
  };
}

describe("root graph interrupt/resume", () => {
  test("interrupts on high-risk destructive recommendation and resumes with explicit approval control", async () => {
    const checkpointer = new MemorySaver();
    let executorCalled = false;

    const graph = await createRootGraph({
      checkpointer,
      planner: async () => ({ summary: "planned", mode: "plan" }),
      executor: async () => {
        executorCalled = true;
        return { summary: "executed", mode: "execute" };
      },
      verifier: async () => ({ summary: "verified", mode: "verify" }),
    });

    const interrupted = await graph.invoke(
      { input: "delete the entire src directory recursively" },
      { configurable: { thread_id: "thread_interrupt", task_id: "task_interrupt" } },
    );

    expect(isInterrupted(interrupted)).toBe(true);
    if (!isInterrupted(interrupted)) {
      throw new Error("Expected graph interrupt");
    }

    expect(interrupted[INTERRUPT][0]?.value).toEqual({
      kind: "approval",
      mode: "waiting_approval",
      summary: "",
    });

    const resumed = await graph.invoke(
      new Command({ resume: { kind: "approval_resolution", decision: "approved", approvalRequestId: "approval_interrupt" } }),
      { configurable: { thread_id: "thread_interrupt", task_id: "task_interrupt" } },
    );

    expect(isInterrupted(resumed)).toBe(false);
    expect(executorCalled).toBe(true);
    expect(resumed.mode).toBe("done");
    expect(resumed.summary).toBe("executed");
  });

  test("hydrates legacy pending approvals into the kernel session view", async () => {
    const workspaceRoot = await createWorkspace();
    const dataDir = join(workspaceRoot, "agent.sqlite");
    const targetPath = join(workspaceRoot, "src/legacy-delete.ts");
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await Bun.write(targetPath, "export const legacyDelete = true;\n");

    const seedDb = createSqlite(dataDir);
    migrateSqlite(seedDb);
    seedDb.run(`INSERT INTO threads (thread_id, workspace_root, project_id, revision, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [
      "thread_legacy",
      workspaceRoot,
      "legacy-project",
      1,
      "waiting_approval",
      new Date().toISOString(),
    ]);
    seedDb.run(`INSERT INTO tasks (task_id, thread_id, summary, status) VALUES (?, ?, ?, ?)`, [
      "task_legacy",
      "thread_legacy",
      "delete src/legacy-delete.ts",
      "blocked",
    ]);
    seedDb.run(
      `INSERT INTO approvals (approval_request_id, thread_id, task_id, tool_call_id, request_json, summary, risk, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "approval_legacy",
        "thread_legacy",
        "task_legacy",
        "tool_legacy",
        null,
        "apply_patch delete_file src/legacy-delete.ts",
        "apply_patch.delete_file",
        "pending",
      ],
    );
    seedDb.close();

    const ctx = await createAppContext({
      workspaceRoot,
      dataDir,
      projectId: "legacy-project",
      modelGateway: createTestModelGateway(),
    });

    const hydrated = await ctx.kernel.hydrateSession();
    expect(hydrated?.threadId).toBe("thread_legacy");
    expect(hydrated?.status).toBe("waiting_approval");
    expect(hydrated?.tasks?.[0]?.status).toBe("blocked");
    expect(hydrated?.approvals?.[0]?.approvalRequestId).toBe("approval_legacy");
    expect(await Bun.file(targetPath).exists()).toBe(true);

    await closeAppContext(ctx);
  });

  test("approves legacy pending delete requests without natural-language resume text", async () => {
    const workspaceRoot = await createWorkspace();
    const dataDir = join(workspaceRoot, "agent.sqlite");
    const targetPath = join(workspaceRoot, "src/legacy-delete.ts");
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await Bun.write(targetPath, "export const legacyDelete = true;\n");

    const seedDb = createSqlite(dataDir);
    migrateSqlite(seedDb);
    seedDb.run(`INSERT INTO threads (thread_id, workspace_root, project_id, revision, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [
      "thread_legacy",
      workspaceRoot,
      "legacy-project",
      1,
      "waiting_approval",
      new Date().toISOString(),
    ]);
    seedDb.run(`INSERT INTO tasks (task_id, thread_id, summary, status) VALUES (?, ?, ?, ?)`, [
      "task_legacy",
      "thread_legacy",
      "delete src/legacy-delete.ts",
      "blocked",
    ]);
    seedDb.run(
      `INSERT INTO approvals (approval_request_id, thread_id, task_id, tool_call_id, request_json, summary, risk, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "approval_legacy",
        "thread_legacy",
        "task_legacy",
        "tool_legacy",
        null,
        "apply_patch delete_file src/legacy-delete.ts",
        "apply_patch.delete_file",
        "pending",
      ],
    );
    seedDb.close();

    const ctx = await createAppContext({
      workspaceRoot,
      dataDir,
      projectId: "legacy-project",
      modelGateway: createTestModelGateway(),
    });

    const immediate = await ctx.kernel.handleCommand({
      type: "approve_request",
      payload: { approvalRequestId: "approval_legacy" },
    });

    expect(immediate.threadId).toBe("thread_legacy");

    const hydrated = await waitFor(
      () => ctx.kernel.hydrateSession(),
      (value) => (value?.approvals?.length ?? 0) === 0 && value?.tasks?.[0]?.status === "completed",
    );
    expect(hydrated?.approvals).toHaveLength(0);
    expect(hydrated?.tasks?.[0]?.status).toBe("completed");
    expect(await Bun.file(targetPath).exists()).toBe(false);

    await closeAppContext(ctx);
  });

  test("rejects legacy pending delete requests without requiring checkpoint-backed resume", async () => {
    const workspaceRoot = await createWorkspace();
    const dataDir = join(workspaceRoot, "agent.sqlite");
    const targetPath = join(workspaceRoot, "src/legacy-delete.ts");
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await Bun.write(targetPath, "export const legacyDelete = true;\n");

    const seedDb = createSqlite(dataDir);
    migrateSqlite(seedDb);
    seedDb.run(`INSERT INTO threads (thread_id, workspace_root, project_id, revision, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [
      "thread_legacy_reject",
      workspaceRoot,
      "legacy-project",
      1,
      "waiting_approval",
      new Date().toISOString(),
    ]);
    seedDb.run(`INSERT INTO tasks (task_id, thread_id, summary, status) VALUES (?, ?, ?, ?)`, [
      "task_legacy_reject",
      "thread_legacy_reject",
      "delete src/legacy-delete.ts",
      "blocked",
    ]);
    seedDb.run(
      `INSERT INTO approvals (approval_request_id, thread_id, task_id, tool_call_id, request_json, summary, risk, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "approval_legacy_reject",
        "thread_legacy_reject",
        "task_legacy_reject",
        "tool_legacy_reject",
        null,
        "apply_patch delete_file src/legacy-delete.ts",
        "apply_patch.delete_file",
        "pending",
      ],
    );
    seedDb.close();

    const ctx = await createAppContext({
      workspaceRoot,
      dataDir,
      projectId: "legacy-project",
      modelGateway: createTestModelGateway(),
    });

    const immediate = await ctx.kernel.handleCommand({
      type: "reject_request",
      payload: { approvalRequestId: "approval_legacy_reject" },
    });

    expect(immediate.threadId).toBe("thread_legacy_reject");

    const hydrated = await waitFor(
      () => ctx.kernel.hydrateSession(),
      (value) => (value?.approvals?.length ?? 0) === 0 && value?.tasks?.[0]?.status === "cancelled",
    );
    expect(hydrated?.approvals).toHaveLength(0);
    expect(hydrated?.tasks?.[0]?.status).toBe("cancelled");
    expect(await Bun.file(targetPath).exists()).toBe(true);

    await closeAppContext(ctx);
  });

  test("does not enqueue a duplicate destructive side effect after recovery blocks an uncertain execution", async () => {
    const workspaceRoot = await createWorkspace();
    const dataDir = join(workspaceRoot, "agent.sqlite");
    const targetPath = join(workspaceRoot, "src", "danger.ts");
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await Bun.write(targetPath, "export const danger = true;\n");

    const seedDb = createSqlite(dataDir);
    migrateSqlite(seedDb);
    seedDb.run(`INSERT INTO threads (thread_id, workspace_root, project_id, revision, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [
      "thread_recovery_gate",
      workspaceRoot,
      "legacy-project",
      1,
      "active",
      new Date().toISOString(),
    ]);
    seedDb.run(
      `INSERT INTO runs (run_id, thread_id, status, trigger, input_text, active_task_id, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        "run_recovery_gate",
        "thread_recovery_gate",
        "running",
        "user_input",
        "delete src/danger.ts",
        "task_recovery_gate",
        new Date().toISOString(),
      ],
    );
    seedDb.run(`INSERT INTO tasks (task_id, thread_id, run_id, summary, status) VALUES (?, ?, ?, ?, ?)`, [
      "task_recovery_gate",
      "thread_recovery_gate",
      "run_recovery_gate",
      "delete src/danger.ts",
      "running",
    ]);
    seedDb.run(
      `INSERT INTO execution_ledger (
        execution_id, thread_id, run_id, task_id, tool_call_id, tool_name, args_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "exec_recovery_gate",
        "thread_recovery_gate",
        "run_recovery_gate",
        "task_recovery_gate",
        "task_recovery_gate:apply_patch",
        "apply_patch",
        JSON.stringify({ path: targetPath }),
        "started",
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );
    seedDb.close();

    const ctx = await createAppContext({
      workspaceRoot,
      dataDir,
      projectId: "legacy-project",
      modelGateway: createTestModelGateway(),
    });

    const blocked = await ctx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "continue working" },
    });

    expect(blocked.status).toBe("blocked");
    const ledgerEntries = await ctx.stores.executionLedger.listByThread("thread_recovery_gate");
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0]?.status).toBe("unknown_after_crash");
    expect(await Bun.file(targetPath).exists()).toBe(true);

    await closeAppContext(ctx);
  });
});
