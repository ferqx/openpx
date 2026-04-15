import { describe, expect, test, afterEach } from "bun:test";
import { createHarnessSessionRegistry } from "../../src/harness/server/harness-session-registry";
import { createAppContext } from "../../src/app/bootstrap";
import { createRun, transitionRun } from "../../src/domain/run";
import { createThread } from "../../src/domain/thread";
import { createTask } from "../../src/domain/task";
import { createApprovalRequest } from "../../src/domain/approval";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("HarnessSessionRegistry", () => {
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
    const runtime = await createHarnessSessionRegistry({ dataDir: ":memory:", workspaceRoot: testDir });
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

  test("reuses scoped runtime truth within one device service and isolates other scopes", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "runtime-service-multi-scope.sqlite");
    const workspaceA = path.join(testDir, "workspace-a");
    const workspaceB = path.join(testDir, "workspace-b");
    await fs.mkdir(workspaceA, { recursive: true });
    await fs.mkdir(workspaceB, { recursive: true });

    const runtime = await createHarnessSessionRegistry({ dataDir, workspaceRoot: workspaceA, projectId: "project-a" });

    await runtime.handleCommand(
      { kind: "new_thread" },
      { workspaceRoot: workspaceA, projectId: "project-a" },
    );
    const firstScope = await runtime.getSnapshot({ workspaceRoot: workspaceA, projectId: "project-a" });
    const firstThreadId = firstScope.activeThreadId;

    expect(firstThreadId).toBeString();
    expect(firstScope.threads).toHaveLength(1);

    const rehydratedFirstScope = await runtime.getSnapshot({ workspaceRoot: workspaceA, projectId: "project-a" });
    expect(rehydratedFirstScope.activeThreadId).toBe(firstThreadId);
    expect(rehydratedFirstScope.threads).toHaveLength(1);

    const isolatedSecondScope = await runtime.getSnapshot({ workspaceRoot: workspaceB, projectId: "project-b" });
    expect(isolatedSecondScope.activeThreadId).toBeUndefined();
    expect(isolatedSecondScope.threads).toEqual([]);

    await runtime.handleCommand(
      { kind: "new_thread" },
      { workspaceRoot: workspaceB, projectId: "project-b" },
    );
    const secondScope = await runtime.getSnapshot({ workspaceRoot: workspaceB, projectId: "project-b" });

    expect(secondScope.activeThreadId).toBeString();
    expect(secondScope.activeThreadId).not.toBe(firstThreadId);
    expect(secondScope.threads).toHaveLength(1);

    const firstScopeAfterSecond = await runtime.getSnapshot({ workspaceRoot: workspaceA, projectId: "project-a" });
    expect(firstScopeAfterSecond.activeThreadId).toBe(firstThreadId);
    expect(firstScopeAfterSecond.threads).toHaveLength(1);
  });

  test("creates, switches, and continues threads within a scoped project", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const runtime = await createHarnessSessionRegistry({ dataDir: ":memory:", workspaceRoot: testDir, projectId: "project-a" });

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
    await app.stores.threadStore.save({ ...thread, status: "active" });
    const run = transitionRun(
      transitionRun(
        createRun({
          runId: "run-blocked-1",
          threadId: thread.threadId,
          trigger: "user_input",
          inputText: "Recover risky patch",
        }),
        "running",
      ),
      "blocked",
    );
    await app.stores.runStore.save({
      ...run,
      activeTaskId: "task-blocked-1",
      blockingReason: {
        kind: "human_recovery",
        message: "Manual recovery required before continuing this thread.",
      },
    });

    const task = createTask("task-blocked-1", thread.threadId, run.runId, "Recover risky patch");
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
        runId: run.runId,
        taskId: task.taskId,
        toolCallId: "tool-call-1",
        toolRequest: {
          toolCallId: "tool-call-1",
          threadId: thread.threadId,
          runId: run.runId,
          taskId: task.taskId,
          toolName: "apply_patch",
          args: {},
        },
        summary: "Review risky patch before continuing",
        risk: "workspace_write",
      }),
    );

    const runtime = await createHarnessSessionRegistry({ dataDir, workspaceRoot: testDir, projectId });
    const snapshot = await runtime.getSnapshot({ workspaceRoot: testDir, projectId });

    expect(snapshot.blockingReason).toEqual({
      kind: "human_recovery",
      message: "Manual recovery required before continuing this thread.",
    });
    expect(snapshot.activeRunId).toBe("run-blocked-1");
    expect(snapshot.runs[0]?.runId).toBe("run-blocked-1");
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
      status: "idle" as const,
    };
    await app.stores.threadStore.save(thread);

    const runtime = await createHarnessSessionRegistry({ dataDir, workspaceRoot: testDir, projectId });

    const result = await runtime.handleCommand(
      { kind: "interrupt", threadId: thread.threadId },
      { workspaceRoot: testDir, projectId },
    );

    expect(result.threadId).toBe(thread.threadId);
    expect(result.status).toBe("idle");

    const snapshot = await runtime.getSnapshot({ workspaceRoot: testDir, projectId });
    expect(snapshot.activeThreadId).toBe(thread.threadId);
    expect(snapshot.threads[0]?.status).toBe("idle");
  });

  test("treats interrupt on a thread with a completed latest run as a no-op", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "runtime-service-interrupt-run.sqlite");
    const projectId = "interrupt-run-project";
    const app = await createAppContext({ dataDir, workspaceRoot: testDir, projectId });

    const thread = createThread("thread-completed-run-1", testDir, projectId);
    await app.stores.threadStore.save(thread);
    await app.stores.runStore.save(
      transitionRun(
        transitionRun(
          createRun({
            runId: "run-completed-1",
            threadId: thread.threadId,
            trigger: "user_input",
            inputText: "Finished work",
          }),
          "running",
        ),
        "completed",
      ),
    );

    const runtime = await createHarnessSessionRegistry({ dataDir, workspaceRoot: testDir, projectId });

    const result = await runtime.handleCommand(
      { kind: "interrupt", threadId: thread.threadId },
      { workspaceRoot: testDir, projectId },
    );

    expect(result.threadId).toBe(thread.threadId);
    expect(result.status).toBe("completed");

    const snapshot = await runtime.getSnapshot({ workspaceRoot: testDir, projectId });
    expect(snapshot.activeThreadId).toBe(thread.threadId);
    expect(snapshot.activeRunId).toBe("run-completed-1");
    expect(snapshot.threads[0]?.activeRunStatus).toBe("completed");
  });

  test("includes each thread's latest run status in the thread list snapshot", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "runtime-service-thread-list.sqlite");
    const projectId = "thread-list-project";
    const app = await createAppContext({ dataDir, workspaceRoot: testDir, projectId });

    const waitingThread = createThread("thread-waiting", testDir, projectId);
    const completedThread = createThread("thread-completed", testDir, projectId);
    await app.stores.threadStore.save(waitingThread);
    await app.stores.threadStore.save(completedThread);
    await app.stores.runStore.save({
      ...transitionRun(
        transitionRun(
          createRun({
            runId: "run-waiting",
            threadId: waitingThread.threadId,
            trigger: "user_input",
            inputText: "Need approval",
          }),
          "running",
        ),
        "waiting_approval",
      ),
      blockingReason: {
        kind: "waiting_approval",
        message: "Need approval",
      },
    });
    await app.stores.runStore.save(
      transitionRun(
        transitionRun(
          createRun({
            runId: "run-completed",
            threadId: completedThread.threadId,
            trigger: "user_input",
            inputText: "Done",
          }),
          "running",
        ),
        "completed",
      ),
    );

    const runtime = await createHarnessSessionRegistry({ dataDir, workspaceRoot: testDir, projectId });
    const snapshot = await runtime.getSnapshot({ workspaceRoot: testDir, projectId });
    const waitingView = snapshot.threads.find((thread) => thread.threadId === waitingThread.threadId);
    const completedView = snapshot.threads.find((thread) => thread.threadId === completedThread.threadId);

    expect(waitingView?.activeRunId).toBe("run-waiting");
    expect(waitingView?.activeRunStatus).toBe("waiting_approval");
    expect(completedView?.activeRunId).toBe("run-completed");
    expect(completedView?.activeRunStatus).toBe("completed");
  });

  test("does not create a thread when continue or interrupt is called on an empty scope", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const runtime = await createHarnessSessionRegistry({ dataDir: ":memory:", workspaceRoot: testDir, projectId: "empty-project" });

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

  test("controls worker lifecycle through runtime commands and reflects it in snapshot truth", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "runtime-service-worker-control.sqlite");
    const projectId = "worker-control-project";
    const app = await createAppContext({ dataDir, workspaceRoot: testDir, projectId });

    const thread = createThread("thread-worker-control-1", testDir, projectId);
    await app.stores.threadStore.save({ ...thread, status: "active" });
    await app.stores.taskStore.save(createTask("task-worker-control-1", thread.threadId, "run-1", "Hydrate worker truth"));

    const runtime = await createHarnessSessionRegistry({ dataDir, workspaceRoot: testDir, projectId });

    await runtime.handleCommand(
      {
        kind: "worker_spawn",
        threadId: thread.threadId,
        taskId: "task-worker-control-1",
        role: "planner",
        spawnReason: "hydrate runtime truth",
      },
      { workspaceRoot: testDir, projectId },
    );

    let snapshot = await runtime.getSnapshot({ workspaceRoot: testDir, projectId });
    expect(snapshot.workers).toHaveLength(1);
    expect(snapshot.workers[0]?.status).toBe("running");
    expect(snapshot.workers[0]?.spawnReason).toBe("hydrate runtime truth");

    const workerId = snapshot.workers[0]!.workerId;

    await runtime.handleCommand(
      { kind: "worker_join", workerId },
      { workspaceRoot: testDir, projectId },
    );

    snapshot = await runtime.getSnapshot({ workspaceRoot: testDir, projectId });
    expect(snapshot.workers[0]?.workerId).toBe(workerId);
    expect(snapshot.workers[0]?.status).toBe("completed");
    expect(snapshot.workers[0]?.endedAt).toBeString();
  });
});
