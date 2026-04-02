import { describe, expect, test } from "bun:test";
import { createWorkerManager } from "../../src/control/workers/worker-manager";

describe("WorkerManager", () => {
  test("spawns an executor worker for a task", async () => {
    const starts: Array<{
      workerId: string;
      role: string;
      taskId: string;
      threadId: string;
      spawnReason: string;
    }> = [];
    const manager = createWorkerManager({
      runtimeFactory(input) {
        return {
          async start() {
            starts.push(input);
          },
        };
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
    expect(starts).toEqual([
      {
        workerId: worker.workerId,
        role: "executor",
        taskId: "task_1",
        threadId: "thread_1",
        spawnReason: "execute patch",
      },
    ]);
  });

  test("creates distinct worker IDs when the timestamp collides", async () => {
    const originalDateNow = Date.now;
    Date.now = () => 1234567890;

    const starts: Array<{ workerId: string }> = [];
    const manager = createWorkerManager({
      runtimeFactory(input) {
        return {
          async start() {
            starts.push({
              workerId: input.workerId,
            });
          },
        };
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
});
