import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAppContext } from "../../src/app/bootstrap";
import { createRuntimeService } from "../../src/runtime/service/runtime-service";
import { createThread } from "../../src/domain/thread";
import { createTask, transitionTask } from "../../src/domain/task";
import { createWorker, transitionWorker } from "../../src/domain/worker";

describe("worker lifecycle protocol", () => {
  const testDir = path.join(os.tmpdir(), `worker-lifecycle-protocol-${Date.now()}-${Math.random()}`);

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test("stores worker lifecycle state and lists active workers per thread", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "worker.sqlite");
    const app = await createAppContext({
      dataDir,
      workspaceRoot: testDir,
      projectId: "worker-project",
    });

    const worker = transitionWorker(
      transitionWorker(
        createWorker({
          workerId: "worker-1",
          threadId: "thread-1",
          taskId: "task-1",
          role: "planner",
          spawnReason: "initial planning",
          resumeToken: "resume-1",
        }),
        "starting",
        { startedAt: "2026-04-06T00:00:00.000Z" },
      ),
      "running",
      { resumeToken: "resume-1" },
    );

    await app.stores.workerStore.save(worker);

    const reloaded = await app.stores.workerStore.get(worker.workerId);
    const activeWorkers = await app.stores.workerStore.listActiveByThread(worker.threadId);

    expect(reloaded).toEqual(worker);
    expect(activeWorkers).toEqual([worker]);

    const completedWorker = transitionWorker(worker, "completed", {
      endedAt: "2026-04-06T00:01:00.000Z",
      resumeToken: undefined,
    });
    await app.stores.workerStore.save(completedWorker);

    expect(await app.stores.workerStore.listActiveByThread(worker.threadId)).toEqual([]);
  });

  test("hydrates worker views into runtime snapshots", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "runtime.sqlite");
    const projectId = "worker-runtime-project";
    const app = await createAppContext({ dataDir, workspaceRoot: testDir, projectId });

    const thread = createThread("thread-worker-1", testDir, projectId);
    await app.stores.threadStore.save({ ...thread, status: "active" });

    const task = transitionTask(createTask("task-worker-1", thread.threadId, "Plan workerized execution"), "running");
    await app.stores.taskStore.save(task);

    const worker = transitionWorker(
      transitionWorker(
        createWorker({
          workerId: "worker-worker-1",
          threadId: thread.threadId,
          taskId: task.taskId,
          role: "planner",
          spawnReason: "initial planning",
          resumeToken: "resume-worker-1",
        }),
        "starting",
        { startedAt: "2026-04-06T00:00:00.000Z" },
      ),
      "running",
      { resumeToken: "resume-worker-1" },
    );
    await app.stores.workerStore.save(worker);

    const runtime = await createRuntimeService({ dataDir, workspaceRoot: testDir, projectId });
    const snapshot = await runtime.getSnapshot({ workspaceRoot: testDir, projectId });

    expect(snapshot.activeThreadId).toBe(thread.threadId);
    expect(snapshot.workers).toEqual([
      expect.objectContaining({
        workerId: worker.workerId,
        threadId: worker.threadId,
        taskId: worker.taskId,
        role: "planner",
        status: "running",
        spawnReason: "initial planning",
        startedAt: "2026-04-06T00:00:00.000Z",
        resumeToken: "resume-worker-1",
      }),
    ]);
  });
});
