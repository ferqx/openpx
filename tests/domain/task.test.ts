import { describe, expect, test } from "bun:test";
import { DomainError } from "../../src/shared/errors";
import { createTask, transitionTask } from "../../src/domain/task";

describe("task transitions", () => {
  test("creates a task scoped to a run", () => {
    const task = createTask("task_1", "thread_1", "run_1", "inspect repo");

    expect(task.taskId).toBe("task_1");
    expect(task.threadId).toBe("thread_1");
    expect(task.runId).toBe("run_1");
    expect(task.summary).toBe("inspect repo");
    expect(task.status).toBe("queued");
  });

  test("allows the declared transition matrix", () => {
    const cases: Array<[string, Parameters<typeof transitionTask>[1]]> = [
      ["queued", "running"],
      ["queued", "blocked"],
      ["queued", "completed"],
      ["queued", "failed"],
      ["queued", "cancelled"],
      ["running", "blocked"],
      ["running", "completed"],
      ["blocked", "running"],
      ["blocked", "completed"],
      ["blocked", "cancelled"],
    ];

    for (const [from, to] of cases) {
      const task = {
        taskId: "task_1",
        threadId: "thread_1",
        runId: "run_1",
        status: from as Parameters<typeof transitionTask>[0]["status"],
      };
      const next = transitionTask(task, to);

      expect(next.status).toBe(to);
    }
  });

  test("rejects a disallowed transition with a shared domain error", () => {
    const task = transitionTask(transitionTask(createTask("task_1", "thread_1", "run_1"), "running"), "completed");

    expect(() => transitionTask(task, "running")).toThrow(DomainError);
    expect(() => transitionTask(task, "running")).toThrow("invalid task transition from completed to running");
  });
});
