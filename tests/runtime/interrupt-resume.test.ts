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

function createTestModelGateway() {
  return {
    async plan(input: { prompt: string }) {
      return { summary: `planned: ${input.prompt}` };
    },
    async verify() {
      return { summary: "verified", isValid: true };
    },
    onStatusChange() {
      return () => {};
    },
  };
}

describe("root graph interrupt/resume", () => {
  test("interrupts after execution and resumes to done using the injected checkpointer", async () => {
    const checkpointer = new MemorySaver();
    const graph = await createRootGraph({
      checkpointer,
      planner: async () => ({ summary: "planned", mode: "plan" }),
      executor: async () => ({ summary: "executed", mode: "execute" }),
      verifier: async () => ({ summary: "verified", mode: "verify" }),
    });

    const interrupted = await graph.invoke(
      { input: "execute the patch" },
      { configurable: { thread_id: "thread_interrupt", task_id: "task_interrupt" } },
    );

    expect(isInterrupted(interrupted)).toBe(true);
    if (!isInterrupted(interrupted)) {
      throw new Error("Expected graph interrupt");
    }

    expect(interrupted[INTERRUPT][0]?.value).toEqual({
      kind: "post-turn-review",
      mode: "execute",
      summary: "executed",
    });

    const resumed = await graph.invoke(
      new Command({ resume: "approved and done" }),
      { configurable: { thread_id: "thread_interrupt", task_id: "task_interrupt" } },
    );

    expect(resumed.mode).toBe("done");
    expect(resumed.summary).toBe("executed");
  });

  test("blocks delete_file patches until approved", async () => {
    const workspaceRoot = await createWorkspace();
    const dataDir = join(workspaceRoot, "agent.sqlite");
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await Bun.write(join(workspaceRoot, "src/old.ts"), "export const legacy = true;\n");

    const ctx = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: createTestModelGateway(),
    });

    const firstResult = await ctx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "delete src/old.ts" },
    });

    // 1. Recommendation interrupt
    expect(firstResult.status).toBe("waiting_approval");
    expect(firstResult.recommendationReason).toContain("high-risk");
    expect(firstResult.approvals).toHaveLength(0);
    
    const result = await ctx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "yes" } // Confirm team mode
    } as any);

    // 2. Actual delete approval interrupt
    // We might need to hydrate or wait if it's async, but handleCommand is awaited.
    expect(result.status).toBe("waiting_approval");
    expect(result.approvals).toHaveLength(1);
    expect(result.approvals[0]?.summary).toContain("delete_file");

    const db = createSqlite(dataDir);
    const checkpointCount = db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM checkpoints")
      .get()?.count;
    db.close();

    expect(checkpointCount).toBeGreaterThan(0);
  });

  test("does not duplicate approval records across separate app boots while a thread stays blocked", async () => {
    const workspaceRoot = await createWorkspace();
    const dataDir = join(workspaceRoot, "agent.sqlite");
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await Bun.write(join(workspaceRoot, "src/old-a.ts"), "export const a = true;\n");

    const firstCtx = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: createTestModelGateway(),
    });
    const firstResult = await firstCtx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "delete src/old-a.ts" },
    });
    expect(firstResult.status).toBe("waiting_approval");
    expect(firstResult.recommendationReason).toContain("high-risk");

    const secondResult = await firstCtx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "yes" }
    } as any);
    expect(secondResult.status).toBe("waiting_approval");
    expect(secondResult.approvals).toHaveLength(1);

    const secondCtx = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: createTestModelGateway(),
    });
    const secondCtxResult = await secondCtx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "delete src/old-a.ts again" },
    });

    const db = createSqlite(dataDir);
    const approvals = db
      .query<{ approval_request_id: string; summary: string }, []>(
        `SELECT approval_request_id, summary
         FROM approvals
         ORDER BY rowid ASC`,
      )
      .all();
    db.close();

    expect(firstResult.approvals).toHaveLength(0); // Before 'yes'
    expect(secondResult.approvals).toHaveLength(1); // After 'yes'
    expect(secondCtxResult.approvals).toHaveLength(1);
    expect(secondCtxResult.approvals[0]?.approvalRequestId).toBe(secondResult.approvals[0]?.approvalRequestId);
    expect(approvals).toHaveLength(1);
  });

  test("hydrates and resumes approval-blocked work across app restarts", async () => {
    const workspaceRoot = await createWorkspace();
    const dataDir = join(workspaceRoot, "agent.sqlite");
    const targetPath = join(workspaceRoot, "src/resume-me.ts");
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await Bun.write(targetPath, "export const resumeMe = true;\n");

    const firstCtx = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: createTestModelGateway(),
    });
    const firstResult = await firstCtx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "delete src/resume-me.ts" },
    });
    expect(firstResult.status).toBe("waiting_approval");
    expect(firstResult.recommendationReason).toContain("high-risk");

    const blocked = await firstCtx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "yes" }
    } as any);

    expect(blocked.status).toBe("waiting_approval");
    expect(blocked.approvals).toHaveLength(1);
    const approvalRequestId = blocked.approvals[0]?.approvalRequestId;
    expect(approvalRequestId).toBeTruthy();
    expect(await Bun.file(targetPath).exists()).toBe(true);

    const restartedCtx = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: createTestModelGateway(),
    });
    const preConfirmation = await restartedCtx.kernel.hydrateSession();
    expect(preConfirmation?.recommendationReason).toBeUndefined();
    const hydrated = await restartedCtx.kernel.hydrateSession();

    expect(hydrated?.threadId).toBe(blocked.threadId);
    expect(hydrated?.status).toBe("waiting_approval");
    expect(hydrated?.tasks).toHaveLength(1);
    expect(hydrated?.tasks[0]?.status).toBe("blocked");
    expect(hydrated?.approvals).toHaveLength(1);
    expect(hydrated?.approvals[0]?.approvalRequestId).toBe(approvalRequestId);

    const resumed = await restartedCtx.kernel.handleCommand({
      type: "approve_request",
      payload: { approvalRequestId: approvalRequestId! },
    });

    expect(resumed.status).toBe("completed");
    expect(resumed.threadId).toBe(blocked.threadId);
    expect(resumed.approvals).toHaveLength(0);
    expect(resumed.tasks[0]?.status).toBe("completed");
    expect(await Bun.file(targetPath).exists()).toBe(false);

    const afterResumeCtx = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: createTestModelGateway(),
    });
    const afterResume = await afterResumeCtx.kernel.hydrateSession();

    expect(afterResume?.threadId).toBe(blocked.threadId);
    expect(afterResume?.approvals).toHaveLength(0);
    expect(afterResume?.tasks[0]?.status).toBe("completed");
  });

  test("can resume legacy pending approvals that were saved before request_json existed", async () => {
    const workspaceRoot = await createWorkspace();
    const dataDir = join(workspaceRoot, "agent.sqlite");
    const targetPath = join(workspaceRoot, "src/legacy-delete.ts");
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await Bun.write(targetPath, "export const legacyDelete = true;\n");

    const seedDb = createSqlite(dataDir);
    migrateSqlite(seedDb);
    seedDb.run(`INSERT INTO threads (thread_id, status, updated_at) VALUES (?, ?, ?)`, [
      "thread_legacy",
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
      modelGateway: createTestModelGateway(),
    });
    const hydrated = await ctx.kernel.hydrateSession();
    expect(hydrated?.approvals[0]?.approvalRequestId).toBe("approval_legacy");
    expect(await Bun.file(targetPath).exists()).toBe(true);

    const resumed = await ctx.kernel.handleCommand({
      type: "approve_request",
      payload: { approvalRequestId: "approval_legacy" },
    });

    expect(resumed.status).toBe("completed");
    expect(resumed.approvals).toHaveLength(0);
    expect(await Bun.file(targetPath).exists()).toBe(false);
  });
});
