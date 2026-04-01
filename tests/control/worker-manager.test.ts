import { describe, expect, test } from "bun:test";
import { createWorkerManager } from "../../src/control/workers/worker-manager";

describe("WorkerManager", () => {
  test("spawns an executor worker for a task", async () => {
    const starts: Array<{ role: string }> = [];
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
    expect(starts).toEqual([{ role: "executor" }]);
  });
});
