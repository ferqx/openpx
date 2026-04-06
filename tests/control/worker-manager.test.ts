import { describe, expect, test } from "bun:test";
import { createWorkerManager } from "../../src/control/workers/worker-manager";
import type { Worker } from "../../src/domain/worker";

describe("WorkerManager", () => {
  test("spawns an executor worker for a task", async () => {
    const starts: Array<{
      workerId: string;
      role: string;
      taskId: string;
      threadId: string;
      spawnReason: string;
      resumeToken?: string;
    }> = [];
    const storedWorkers = new Map<string, Worker>();
    const manager = createWorkerManager({
      runtimeFactory(input) {
        return {
          async start() {
            starts.push({ ...input, resumeToken: "resume-started" });
            return {
              status: "running",
              startedAt: "2026-04-06T00:00:00.000Z",
              resumeToken: "resume-started",
            };
          },
          async inspect() {
            return {
              status: "running",
              startedAt: "2026-04-06T00:00:00.000Z",
              resumeToken: "resume-started",
            };
          },
          async resume() {
            return {
              status: "running",
              resumeToken: "resume-started",
            };
          },
          async cancel() {
            return {
              status: "cancelled",
              endedAt: "2026-04-06T00:01:00.000Z",
            };
          },
          async join() {
            return {
              status: "completed",
              endedAt: "2026-04-06T00:02:00.000Z",
            };
          },
        };
      },
      workerStore: {
        async save(worker) {
          storedWorkers.set(worker.workerId, worker);
        },
        async get(workerId) {
          return storedWorkers.get(workerId);
        },
        async listByThread(threadId) {
          return [...storedWorkers.values()].filter((worker) => worker.threadId === threadId);
        },
        async listActiveByThread(threadId) {
          return [...storedWorkers.values()].filter(
            (worker) => worker.threadId === threadId && !["completed", "failed", "cancelled"].includes(worker.status),
          );
        },
        async close() {},
      },
    });

    const worker = await manager.spawn({
      role: "executor",
      taskId: "task_1",
      threadId: "thread_1",
      spawnReason: "execute patch",
    });

    expect(worker.role).toBe("executor");
    expect(worker.status).toBe("running");
    expect(worker.workerId).toStartWith("worker_");
    expect(worker.taskId).toBe("task_1");
    expect(worker.threadId).toBe("thread_1");
    expect(worker.spawnReason).toBe("execute patch");
    expect(worker.startedAt).toBe("2026-04-06T00:00:00.000Z");
    expect(worker.resumeToken).toBe("resume-started");
    expect(starts).toEqual([
      {
        workerId: worker.workerId,
        role: "executor",
        taskId: "task_1",
        threadId: "thread_1",
        spawnReason: "execute patch",
        resumeToken: "resume-started",
      },
    ]);
  });

  test("creates distinct worker IDs when the timestamp collides", async () => {
    const originalDateNow = Date.now;
    Date.now = () => 1234567890;

    const starts: Array<{ workerId: string }> = [];
    const storedWorkers = new Map<string, Worker>();
    const manager = createWorkerManager({
      runtimeFactory(input) {
        return {
          async start() {
            starts.push({
              workerId: input.workerId,
            });
            return {
              status: "running",
              startedAt: "2026-04-06T00:00:00.000Z",
            };
          },
          async inspect() {
            return {
              status: "running",
              startedAt: "2026-04-06T00:00:00.000Z",
            };
          },
          async resume() {
            return {
              status: "running",
            };
          },
          async cancel() {
            return {
              status: "cancelled",
              endedAt: "2026-04-06T00:01:00.000Z",
            };
          },
          async join() {
            return {
              status: "completed",
              endedAt: "2026-04-06T00:02:00.000Z",
            };
          },
        };
      },
      workerStore: {
        async save(worker) {
          storedWorkers.set(worker.workerId, worker);
        },
        async get(workerId) {
          return storedWorkers.get(workerId);
        },
        async listByThread(threadId) {
          return [...storedWorkers.values()].filter((worker) => worker.threadId === threadId);
        },
        async listActiveByThread(threadId) {
          return [...storedWorkers.values()].filter(
            (worker) => worker.threadId === threadId && !["completed", "failed", "cancelled"].includes(worker.status),
          );
        },
        async close() {},
      },
    });

    try {
      const first = await manager.spawn({
        role: "executor",
        taskId: "task_1",
        threadId: "thread_1",
        spawnReason: "execute patch",
      });
      const second = await manager.spawn({
        role: "executor",
        taskId: "task_1",
        threadId: "thread_1",
        spawnReason: "execute patch",
      });

      expect(new Set([first.workerId, second.workerId]).size).toBe(2);
      expect(new Set(starts.map((start) => start.workerId)).size).toBe(2);
    } finally {
      Date.now = originalDateNow;
    }
  });

  test("inspects, resumes, cancels, and joins spawned workers", async () => {
    const calls: string[] = [];
    const storedWorkers = new Map<string, Worker>();
    const manager = createWorkerManager({
      runtimeFactory() {
        return {
          async start() {
            calls.push("start");
            return {
              status: "running",
              startedAt: "2026-04-06T00:00:00.000Z",
              resumeToken: "resume-active",
            };
          },
          async inspect() {
            calls.push("inspect");
            return {
              status: "paused",
              startedAt: "2026-04-06T00:00:00.000Z",
              resumeToken: "resume-paused",
            };
          },
          async resume() {
            calls.push("resume");
            return {
              status: "running",
              resumeToken: "resume-resumed",
            };
          },
          async cancel() {
            calls.push("cancel");
            return {
              status: "cancelled",
              endedAt: "2026-04-06T00:01:00.000Z",
            };
          },
          async join() {
            calls.push("join");
            return {
              status: "completed",
              endedAt: "2026-04-06T00:02:00.000Z",
            };
          },
        };
      },
      workerStore: {
        async save(worker) {
          storedWorkers.set(worker.workerId, worker);
        },
        async get(workerId) {
          return storedWorkers.get(workerId);
        },
        async listByThread(threadId) {
          return [...storedWorkers.values()].filter((worker) => worker.threadId === threadId);
        },
        async listActiveByThread(threadId) {
          return [...storedWorkers.values()].filter(
            (worker) => worker.threadId === threadId && !["completed", "failed", "cancelled"].includes(worker.status),
          );
        },
        async close() {},
      },
    });

    const spawned = await manager.spawn({
      role: "executor",
      taskId: "task_2",
      threadId: "thread_2",
      spawnReason: "execute patch",
    });
    const inspected = await manager.inspect(spawned.workerId);
    const resumed = await manager.resume(spawned.workerId);
    const joined = await manager.join(spawned.workerId);
    const spawnedToCancel = await manager.spawn({
      role: "executor",
      taskId: "task_3",
      threadId: "thread_2",
      spawnReason: "execute patch",
    });
    const cancelled = await manager.cancel(spawnedToCancel.workerId);

    expect(inspected?.status).toBe("paused");
    expect(inspected?.resumeToken).toBe("resume-paused");
    expect(resumed.status).toBe("running");
    expect(resumed.resumeToken).toBe("resume-resumed");
    expect(joined.status).toBe("completed");
    expect(joined.endedAt).toBe("2026-04-06T00:02:00.000Z");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.endedAt).toBe("2026-04-06T00:01:00.000Z");
    expect(calls).toEqual(["start", "inspect", "resume", "join", "start", "cancel"]);
  });
});
