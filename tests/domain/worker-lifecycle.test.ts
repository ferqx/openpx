import { describe, expect, test } from "bun:test";
import { createWorker, transitionWorker } from "../../src/domain/worker";

describe("Worker Lifecycle", () => {
  test("allows worker pause, resume, complete, and cancel lifecycle transitions", () => {
    const worker = createWorker({
      workerId: "w1",
      threadId: "t1",
      taskId: "task1",
      role: "planner",
      spawnReason: "test",
      resumeToken: "resume-1",
    });

    expect(worker.status).toBe("created");
    expect(worker.resumeToken).toBe("resume-1");

    const startingWorker = transitionWorker(worker, "starting", {
      startedAt: "2026-04-06T00:00:00.000Z",
    });
    const runningWorker = transitionWorker(startingWorker, "running", {
      resumeToken: "resume-running",
    });
    const pausedWorker = transitionWorker(runningWorker, "paused", {
      resumeToken: "resume-paused",
    });
    const resumedWorker = transitionWorker(pausedWorker, "running", {
      resumeToken: "resume-resumed",
    });
    const completedWorker = transitionWorker(resumedWorker, "completed", {
      endedAt: "2026-04-06T00:01:00.000Z",
      resumeToken: undefined,
    });
    const cancelledWorker = transitionWorker(resumedWorker, "cancelled", {
      endedAt: "2026-04-06T00:01:30.000Z",
      resumeToken: undefined,
    });

    expect(startingWorker.status).toBe("starting");
    expect(startingWorker.startedAt).toBe("2026-04-06T00:00:00.000Z");
    expect(runningWorker.status).toBe("running");
    expect(runningWorker.resumeToken).toBe("resume-running");
    expect(pausedWorker.status).toBe("paused");
    expect(pausedWorker.resumeToken).toBe("resume-paused");
    expect(resumedWorker.status).toBe("running");
    expect(resumedWorker.resumeToken).toBe("resume-resumed");
    expect(completedWorker.status).toBe("completed");
    expect(completedWorker.endedAt).toBe("2026-04-06T00:01:00.000Z");
    expect(completedWorker.resumeToken).toBeUndefined();
    expect(cancelledWorker.status).toBe("cancelled");
    expect(cancelledWorker.endedAt).toBe("2026-04-06T00:01:30.000Z");
  });

  test("rejects invalid worker lifecycle transitions", () => {
    const worker = createWorker({
      workerId: "w2",
      threadId: "t1",
      taskId: "task2",
      role: "executor",
      spawnReason: "test",
    });

    expect(() => transitionWorker(worker, "completed")).toThrow(/invalid worker transition/);
  });
});
