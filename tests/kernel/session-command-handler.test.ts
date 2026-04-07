import { describe, expect, test } from "bun:test";
import { createRun, transitionRun } from "../../src/domain/run";
import { createThread } from "../../src/domain/thread";
import { resolveSubmitTargetThread } from "../../src/kernel/session-command-handler";

describe("resolveSubmitTargetThread", () => {
  test("starts a new thread when no latest thread exists", async () => {
    const startedThread = createThread("thread-new", "/workspace", "project-1");

    const result = await resolveSubmitTargetThread({
      latestThread: undefined,
      latestRun: undefined,
      expectedRevision: undefined,
      startThread: async () => startedThread,
      saveThread: async () => undefined,
      ensureRevision: async () => undefined,
    });

    expect(result.thread.threadId).toBe("thread-new");
    expect(result.startedNewThread).toBe(true);
  });

  test("reuses and reactivates the latest idle thread", async () => {
    const latestThread = createThread("thread-existing", "/workspace", "project-1");
    const idleThread = { ...latestThread, status: "idle" as const };
    const savedThreads: string[] = [];

    const result = await resolveSubmitTargetThread({
      latestThread: idleThread,
      latestRun: transitionRun(
        transitionRun(createRun({ runId: "run-completed", threadId: idleThread.threadId, trigger: "user_input" }), "running"),
        "completed",
      ),
      expectedRevision: undefined,
      startThread: async () => {
        throw new Error("should not start a new thread");
      },
      saveThread: async (thread) => {
        savedThreads.push(thread.status);
      },
      ensureRevision: async () => undefined,
    });

    expect(result.thread.threadId).toBe("thread-existing");
    expect(result.thread.status).toBe("active");
    expect(result.startedNewThread).toBe(false);
    expect(savedThreads).toEqual(["active"]);
  });

  test("keeps a blocked thread blocked so human recovery is not bypassed", async () => {
    const latestThread = createThread("thread-blocked", "/workspace", "project-1");
    const savedThreads: string[] = [];
    const latestRun = transitionRun(
      transitionRun(createRun({ runId: "run-blocked", threadId: latestThread.threadId, trigger: "approval_resume" }), "running"),
      "blocked",
    );

    const result = await resolveSubmitTargetThread({
      latestThread,
      latestRun,
      expectedRevision: 3,
      startThread: async () => {
        throw new Error("should not start a new thread");
      },
      saveThread: async (thread) => {
        savedThreads.push(thread.status);
      },
      ensureRevision: async () => undefined,
    });

    expect(result.thread.threadId).toBe("thread-blocked");
    expect(result.thread.status).toBe("active");
    expect(result.startedNewThread).toBe(false);
    expect(savedThreads).toEqual([]);
  });

  test("starts a new thread when the latest run failed", async () => {
    const latestThread = createThread("thread-failed-run", "/workspace", "project-1");
    const startedThread = createThread("thread-new", "/workspace", "project-1");

    const result = await resolveSubmitTargetThread({
      latestThread,
      latestRun: transitionRun(
        transitionRun(createRun({ runId: "run-failed", threadId: latestThread.threadId, trigger: "user_input" }), "running"),
        "failed",
      ),
      expectedRevision: undefined,
      startThread: async () => startedThread,
      saveThread: async () => undefined,
      ensureRevision: async () => undefined,
    });

    expect(result.thread.threadId).toBe("thread-new");
    expect(result.startedNewThread).toBe(true);
  });
});
