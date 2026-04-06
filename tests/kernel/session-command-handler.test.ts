import { describe, expect, test } from "bun:test";
import { createThread } from "../../src/domain/thread";
import { resolveSubmitTargetThread } from "../../src/kernel/session-command-handler";

describe("resolveSubmitTargetThread", () => {
  test("starts a new thread when no latest thread exists", async () => {
    const startedThread = createThread("thread-new", "/workspace", "project-1");

    const result = await resolveSubmitTargetThread({
      latestThread: undefined,
      expectedRevision: undefined,
      startThread: async () => startedThread,
      saveThread: async () => undefined,
      ensureRevision: async () => undefined,
    });

    expect(result.thread.threadId).toBe("thread-new");
    expect(result.startedNewThread).toBe(true);
  });

  test("reuses and reactivates the latest non-failed thread", async () => {
    const latestThread = createThread("thread-existing", "/workspace", "project-1");
    const completedThread = { ...latestThread, status: "completed" as const };
    const savedThreads: string[] = [];

    const result = await resolveSubmitTargetThread({
      latestThread: completedThread,
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
    const latestThread = {
      ...createThread("thread-blocked", "/workspace", "project-1"),
      status: "blocked" as const,
    };
    const savedThreads: string[] = [];

    const result = await resolveSubmitTargetThread({
      latestThread,
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
    expect(result.thread.status).toBe("blocked");
    expect(result.startedNewThread).toBe(false);
    expect(savedThreads).toEqual([]);
  });
});
