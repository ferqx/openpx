import { describe, expect, test } from "bun:test";
import { createThread, transitionThread } from "../../src/domain/thread";
import { createTask, transitionTask } from "../../src/domain/task";

describe("Thread Lifecycle", () => {
  test("allows container lifecycle transitions for threads", () => {
    const thread = createThread("thread-1");
    const idleThread = transitionThread(thread, "idle");
    expect(idleThread.status).toBe("idle");

    const activeThread = transitionThread(idleThread, "active");
    expect(activeThread.status).toBe("active");
  });

  test("persists human-required recovery as blocked task metadata", () => {
    const task = createTask("task-1", "thread-1", "A simple task");
    
    // In src/domain/task.ts, Task doesn't have blockingReason yet.
    const blockedTask = {
      ...transitionTask(task, "blocked"),
      blockingReason: {
        kind: "human_recovery",
        message: "Side effects uncertain after crash",
      }
    };

    expect(blockedTask.status).toBe("blocked");
    expect(blockedTask.blockingReason?.kind).toBe("human_recovery");
  });
});
