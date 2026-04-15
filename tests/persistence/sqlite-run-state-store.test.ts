import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteRunStateStore } from "../../src/persistence/sqlite/sqlite-run-state-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "openpx-run-state-"));
  tempDirs.push(dir);
  return new SqliteRunStateStore(join(dir, "openpx.db"));
}

describe("sqlite run state store", () => {
  test("保存并读取最新 run-loop state", async () => {
    const store = await createStore();
    await store.saveState({
      threadId: "thread_1",
      runId: "run_1",
      taskId: "task_1",
      input: "fix startup message",
      nextStep: "execute",
      currentWorkPackageId: "pkg_startup_message",
      workPackages: [
        {
          id: "pkg_startup_message",
          objective: "Update startup message",
          allowedTools: ["apply_patch"],
          inputRefs: ["thread:goal"],
          expectedArtifacts: ["patch:src/app/main.ts"],
        },
      ],
      artifacts: [],
      latestArtifacts: [],
    });

    const loaded = await store.loadLatestByThread("thread_1");
    expect(loaded?.runId).toBe("run_1");
    expect(loaded?.currentWorkPackageId).toBe("pkg_startup_message");
  });

  test("保存 suspension 与 continuation 并可消费 continuation", async () => {
    const store = await createStore();
    await store.saveSuspension({
      suspensionId: "suspension_1",
      threadId: "thread_1",
      runId: "run_1",
      taskId: "task_1",
      reasonKind: "waiting_approval",
      summary: "Approval required before deleting approved.txt",
      approvalRequestId: "approval_1",
      resumeStep: "execute",
      createdAt: new Date().toISOString(),
    });

    await store.saveContinuation({
      continuationId: "continuation_1",
      kind: "approval_resolution",
      approvalRequestId: "approval_1",
      decision: "approved",
    });

    const suspensions = await store.listSuspensionsByThread("thread_1");
    const continuation = await store.consumeContinuation("continuation_1");
    const missing = await store.consumeContinuation("continuation_1");

    expect(suspensions).toHaveLength(1);
    expect(suspensions[0]?.approvalRequestId).toBe("approval_1");
    expect(continuation?.kind).toBe("approval_resolution");
    expect(missing).toBeUndefined();
  });
});
