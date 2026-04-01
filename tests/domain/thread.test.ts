import { describe, expect, test } from "bun:test";
import { createThread, transitionThread } from "../../src/domain/thread";

describe("thread transitions", () => {
  test("moves from active to waiting_approval", () => {
    const thread = createThread("thread_1");
    const next = transitionThread(thread, "waiting_approval");

    expect(next.threadId).toBe("thread_1");
    expect(next.status).toBe("waiting_approval");
  });
});
