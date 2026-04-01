import { describe, expect, test } from "bun:test";
import { createTask, transitionTask } from "../../src/domain/task";

describe("task transitions", () => {
  test("blocks a running task", () => {
    const task = transitionTask(createTask("task_1", "thread_1"), "running");
    const next = transitionTask(task, "blocked");

    expect(next.taskId).toBe("task_1");
    expect(next.threadId).toBe("thread_1");
    expect(next.status).toBe("blocked");
  });
});
