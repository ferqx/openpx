import { afterEach, describe, expect, test } from "bun:test";
import { Command, INTERRUPT, MemorySaver, isInterrupted } from "@langchain/langgraph";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppContext } from "../../src/app/bootstrap";
import { createSqlite } from "../../src/persistence/sqlite/sqlite-client";
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
      new Command({ resume: "approved" }),
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
    });

    const result = await ctx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "delete src/old.ts" },
    });

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

  test("persists distinct approval ids across separate app boots", async () => {
    const workspaceRoot = await createWorkspace();
    const dataDir = join(workspaceRoot, "agent.sqlite");
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await Bun.write(join(workspaceRoot, "src/old-a.ts"), "export const a = true;\n");
    await Bun.write(join(workspaceRoot, "src/old-b.ts"), "export const b = true;\n");

    const firstCtx = await createAppContext({
      workspaceRoot,
      dataDir,
    });
    const firstResult = await firstCtx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "delete src/old-a.ts" },
    });

    const secondCtx = await createAppContext({
      workspaceRoot,
      dataDir,
    });
    const secondResult = await secondCtx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "delete src/old-b.ts" },
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

    expect(firstResult.approvals).toHaveLength(1);
    expect(secondResult.approvals).toHaveLength(1);
    expect(approvals).toHaveLength(2);
    expect(new Set(approvals.map((approval) => approval.approval_request_id)).size).toBe(2);
  });
});
