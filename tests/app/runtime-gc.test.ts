import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteRunStateStore } from "../../src/persistence/sqlite/sqlite-run-state-store";
import { runRuntimeGc } from "../../src/app/runtime-gc";

describe("runtime gc", () => {
  test("runtime:gc 清理过期 suspension 与 continuation 审计记录", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openpx-runtime-gc-"));
    const dataDir = join(dir, "openpx.db");
    const store = new SqliteRunStateStore(dataDir);

    await store.saveSuspension({
      suspensionId: "suspension_gc_cli",
      threadId: "thread_gc_cli",
      runId: "run_gc_cli",
      taskId: "task_gc_cli",
      reasonKind: "waiting_approval",
      summary: "Approval required before deleting gc-cli.txt",
      approvalRequestId: "approval_gc_cli",
      resumeStep: "execute",
      createdAt: "2026-04-01T00:00:00.000Z",
      status: "resolved",
      resolvedAt: "2026-04-01T00:00:00.000Z",
      resolvedByContinuationId: "continuation_gc_cli",
    });
    await store.saveContinuation({
      continuationId: "continuation_gc_cli",
      threadId: "thread_gc_cli",
      runId: "run_gc_cli",
      taskId: "task_gc_cli",
      kind: "approval_resolution",
      approvalRequestId: "approval_gc_cli",
      decision: "approved",
      step: "execute",
      status: "consumed",
      consumedAt: "2026-04-01T00:00:00.000Z",
    });

    const result = await runRuntimeGc({
      workspaceRoot: dir,
      dataDir,
      now: new Date("2026-04-16T00:00:00.000Z"),
    });

    expect(result.deleted.suspensions).toBe(1);
    expect(result.deleted.continuations).toBe(1);
    expect(await store.loadContinuation("continuation_gc_cli")).toBeUndefined();

    await store.close();
    await rm(dir, { recursive: true, force: true });
  });
});
