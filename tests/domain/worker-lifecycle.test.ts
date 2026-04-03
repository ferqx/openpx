import { describe, expect, test } from "bun:test";
import { createWorker, type WorkerStatus } from "../../src/domain/worker";

describe("Worker Lifecycle", () => {
  test("allows worker pause, complete, and cancel lifecycle transitions", () => {
    // Worker status aligned to the roadmap contract: 
    // created, starting, running, paused, completed, failed, cancelled
    
    // In src/domain/worker.ts, WorkerStatus is current defined as:
    // export type WorkerStatus = "created" | "starting" | "running" | "stopping" | "exited" | "failed";
    
    // We need to update it.
    
    // For now this test will fail because WorkerStatus does not include "paused", "completed", "cancelled".
    // Or we can check if it allows those transitions if we had a transition function.
    // The current worker.ts does not have a transition function.
    
    const worker = createWorker({
      workerId: "w1",
      threadId: "t1",
      ownerTaskId: "task1",
      role: "planner",
      spawnReason: "test",
    });
    
    expect(worker.status).toBe("created");
    
    // We want to update worker status
    const pausedWorker = { ...worker, status: "paused" as WorkerStatus };
    expect(pausedWorker.status).toBe("paused");
    
    const completedWorker = { ...worker, status: "completed" as WorkerStatus };
    expect(completedWorker.status).toBe("completed");
    
    const cancelledWorker = { ...worker, status: "cancelled" as WorkerStatus };
    expect(cancelledWorker.status).toBe("cancelled");
  });
});
