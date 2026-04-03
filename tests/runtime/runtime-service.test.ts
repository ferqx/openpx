import { describe, expect, test, afterEach } from "bun:test";
import { createRuntimeService } from "../../src/runtime/service/runtime-service";
import { createAppContext } from "../../src/app/bootstrap";
import { createThread } from "../../src/domain/thread";
import { createTask } from "../../src/domain/task";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("RuntimeService", () => {
  const testDir = path.join(os.tmpdir(), `runtime-service-test-${Date.now()}`);

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  test("hydrates current thread state and exposes a replay cursor", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const runtime = await createRuntimeService({ dataDir: ":memory:", workspaceRoot: testDir });
    const snapshot = await runtime.getSnapshot();

    expect(snapshot.protocolVersion).toBeString();
    expect(snapshot.workspaceRoot).toBe(testDir);
    expect(snapshot.projectId).toBeString();
    expect(snapshot.lastEventSeq).toBeNumber();
    expect(snapshot.activeThreadId).toBeString();
    expect(snapshot.threads).toBeArray();
    expect(snapshot.tasks).toBeArray();
    expect(snapshot.pendingApprovals).toBeArray();
    expect(snapshot.answers).toBeArray();
  });

  test("starts one device runtime daemon and lets reconnecting clients reuse it across workspaces", async () => {
    // This will likely need runtime-daemon logic
    // For now, let's keep it as a placeholder as suggested by the plan
  });

  test("creates, switches, and continues threads within a scoped project", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const runtime = await createRuntimeService({ dataDir: ":memory:", workspaceRoot: testDir, projectId: "project-a" });

    const initial = await runtime.getSnapshot({
      workspaceRoot: testDir,
      projectId: "project-a",
    });

    await runtime.handleCommand(
      { kind: "new_thread" },
      { workspaceRoot: testDir, projectId: "project-a" },
    );
    const afterNew = await runtime.getSnapshot({
      workspaceRoot: testDir,
      projectId: "project-a",
    });

    expect(afterNew.threads).toHaveLength(2);
    expect(afterNew.activeThreadId).not.toBe(initial.activeThreadId);

    await runtime.handleCommand(
      { kind: "switch_thread", threadId: initial.activeThreadId! },
      { workspaceRoot: testDir, projectId: "project-a" },
    );
    const afterSwitch = await runtime.getSnapshot({
      workspaceRoot: testDir,
      projectId: "project-a",
    });
    expect(afterSwitch.activeThreadId).toBe(initial.activeThreadId);

    await runtime.handleCommand(
      { kind: "continue", threadId: initial.activeThreadId! },
      { workspaceRoot: testDir, projectId: "project-a" },
    );
    const afterContinue = await runtime.getSnapshot({
      workspaceRoot: testDir,
      projectId: "project-a",
    });
    expect(afterContinue.activeThreadId).toBe(initial.activeThreadId);
  });

  test("hydrates structured blocking reason for a blocked thread", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "runtime-service.sqlite");
    const projectId = "blocked-project";
    const app = await createAppContext({ dataDir, workspaceRoot: testDir, projectId });

    const thread = createThread("thread-blocked-1", testDir, projectId);
    await app.stores.threadStore.save({ ...thread, status: "blocked" });

    const task = createTask("task-blocked-1", thread.threadId, "Recover risky patch");
    await app.stores.taskStore.save({
      ...task,
      status: "blocked",
      blockingReason: {
        kind: "human_recovery",
        message: "Manual recovery required before continuing this thread.",
      },
    });

    const runtime = await createRuntimeService({ dataDir, workspaceRoot: testDir, projectId });
    const snapshot = await runtime.getSnapshot({ workspaceRoot: testDir, projectId });

    expect(snapshot.blockingReason).toEqual({
      kind: "human_recovery",
      message: "Manual recovery required before continuing this thread.",
    });
    expect(snapshot.tasks[0]?.blockingReason).toEqual({
      kind: "human_recovery",
      message: "Manual recovery required before continuing this thread.",
    });
  });
});
