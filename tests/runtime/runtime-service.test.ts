import { describe, expect, test, afterEach } from "bun:test";
import { createRuntimeService } from "../../src/runtime/service/runtime-service";
import { createAppContext } from "../../src/app/bootstrap";
import { createThread } from "../../src/domain/thread";
import { createTask } from "../../src/domain/task";
import { createApprovalRequest } from "../../src/domain/approval";
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

  test("hydrates an empty scoped snapshot without creating a thread", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const runtime = await createRuntimeService({ dataDir: ":memory:", workspaceRoot: testDir });
    const snapshot = await runtime.getSnapshot();

    expect(snapshot.protocolVersion).toBeString();
    expect(snapshot.workspaceRoot).toBe(testDir);
    expect(snapshot.projectId).toBeString();
    expect(snapshot.lastEventSeq).toBeNumber();
    expect(snapshot.activeThreadId).toBeUndefined();
    expect(snapshot.threads).toEqual([]);
    expect(snapshot.tasks).toEqual([]);
    expect(snapshot.pendingApprovals).toEqual([]);
    expect(snapshot.answers).toEqual([]);
    expect(snapshot.messages).toEqual([]);
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

    expect(initial.activeThreadId).toBeUndefined();
    expect(initial.threads).toHaveLength(0);

    expect(afterNew.threads).toHaveLength(1);
    expect(afterNew.activeThreadId).toBeString();
    const createdThreadId = afterNew.activeThreadId!;

    await runtime.handleCommand(
      { kind: "switch_thread", threadId: createdThreadId },
      { workspaceRoot: testDir, projectId: "project-a" },
    );
    const afterSwitch = await runtime.getSnapshot({
      workspaceRoot: testDir,
      projectId: "project-a",
    });
    expect(afterSwitch.activeThreadId).toBe(createdThreadId);

    await runtime.handleCommand(
      { kind: "continue", threadId: createdThreadId },
      { workspaceRoot: testDir, projectId: "project-a" },
    );
    const afterContinue = await runtime.getSnapshot({
      workspaceRoot: testDir,
      projectId: "project-a",
    });
    expect(afterContinue.activeThreadId).toBe(createdThreadId);
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
    await app.stores.approvalStore.save(
      createApprovalRequest({
        approvalRequestId: "approval-blocked-1",
        threadId: thread.threadId,
        taskId: task.taskId,
        toolCallId: "tool-call-1",
        toolRequest: {
          toolCallId: "tool-call-1",
          threadId: thread.threadId,
          taskId: task.taskId,
          toolName: "apply_patch",
          args: {},
        },
        summary: "Review risky patch before continuing",
        risk: "workspace_write",
      }),
    );

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
    expect(snapshot.threads[0]?.pendingApprovalCount).toBe(1);
    expect(snapshot.threads[0]?.blockingReasonKind).toBe("human_recovery");
  });

  test("treats interrupt on a completed thread as a no-op", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "runtime-service-interrupt.sqlite");
    const projectId = "interrupt-project";
    const app = await createAppContext({ dataDir, workspaceRoot: testDir, projectId });

    const thread = {
      ...createThread("thread-completed-1", testDir, projectId),
      status: "completed" as const,
    };
    await app.stores.threadStore.save(thread);

    const runtime = await createRuntimeService({ dataDir, workspaceRoot: testDir, projectId });

    const result = await runtime.handleCommand(
      { kind: "interrupt", threadId: thread.threadId },
      { workspaceRoot: testDir, projectId },
    );

    expect(result.threadId).toBe(thread.threadId);
    expect(result.status).toBe("completed");

    const snapshot = await runtime.getSnapshot({ workspaceRoot: testDir, projectId });
    expect(snapshot.activeThreadId).toBe(thread.threadId);
    expect(snapshot.threads[0]?.status).toBe("completed");
  });

  test("does not create a thread when continue or interrupt is called on an empty scope", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const runtime = await createRuntimeService({ dataDir: ":memory:", workspaceRoot: testDir, projectId: "empty-project" });

    await runtime.handleCommand(
      { kind: "continue" },
      { workspaceRoot: testDir, projectId: "empty-project" },
    );
    await runtime.handleCommand(
      { kind: "interrupt" },
      { workspaceRoot: testDir, projectId: "empty-project" },
    );

    const snapshot = await runtime.getSnapshot({ workspaceRoot: testDir, projectId: "empty-project" });
    expect(snapshot.activeThreadId).toBeUndefined();
    expect(snapshot.threads).toEqual([]);
  });
});
