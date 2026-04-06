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
  test("interrupts on high-risk recommendation and resumes with explicit approval control", async () => {
    const checkpointer = new MemorySaver();
    const graph = await createRootGraph({
      checkpointer,
      planner: async () => ({ summary: "planned", mode: "plan" }),
      executor: async () => ({ summary: "executed", mode: "execute" }),
      verifier: async () => ({ summary: "verified", mode: "verify" }),
    });

    const interrupted = await graph.invoke(
      { input: "delete src/old.ts" },
      { configurable: { thread_id: "thread_interrupt", task_id: "task_interrupt" } },
    );

    expect(isInterrupted(interrupted)).toBe(true);
    if (!isInterrupted(interrupted)) {
      throw new Error("Expected graph interrupt");
    }

    expect(interrupted[INTERRUPT][0]?.value).toEqual({
      kind: "post-turn-review",
      mode: "waiting_approval",
      summary: "",
    });

    const resumed = await graph.invoke(
      new Command({ resume: { kind: "approval_resolution", decision: "approved" } }),
      { configurable: { thread_id: "thread_interrupt", task_id: "task_interrupt" } },
    );

    expect(isInterrupted(resumed)).toBe(false);
    expect(resumed.mode).toBe("waiting_approval");
    expect(resumed.resumeValue).toEqual({ kind: "approval_resolution", decision: "approved" });
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

    await new Promise((resolve) => setTimeout(resolve, 20));

    const hydrated = await ctx.kernel.hydrateSession();
    expect(hydrated?.approvals).toHaveLength(0);
    expect(hydrated?.tasks?.[0]?.status).toBe("completed");
    expect(await Bun.file(targetPath).exists()).toBe(false);
  });
});
