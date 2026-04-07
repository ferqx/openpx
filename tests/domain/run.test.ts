import { describe, expect, test } from "bun:test";
import { DomainError } from "../../src/shared/errors";
import { createRun, transitionRun, type Run } from "../../src/domain/run";

describe("run transitions", () => {
  test("creates a run with execution lifecycle defaults", () => {
    const run = createRun({
      runId: "run_1",
      threadId: "thread_1",
      trigger: "user_input",
      inputText: "Inspect the runtime snapshot model",
    });

    expect(run.runId).toBe("run_1");
    expect(run.threadId).toBe("thread_1");
    expect(run.trigger).toBe("user_input");
    expect(run.inputText).toBe("Inspect the runtime snapshot model");
    expect(run.status).toBe("created");
    expect(run.startedAt).toBeString();
  });

  test("allows the declared transition matrix", () => {
    const cases: Array<[string, Parameters<typeof transitionRun>[1]]> = [
      ["created", "running"],
      ["created", "interrupted"],
      ["running", "waiting_approval"],
      ["running", "blocked"],
      ["running", "completed"],
      ["running", "failed"],
      ["running", "interrupted"],
      ["waiting_approval", "running"],
      ["blocked", "running"],
      ["interrupted", "running"],
    ];

    for (const [from, to] of cases) {
      const run: Pick<Run, "runId" | "threadId" | "trigger" | "status" | "startedAt"> = {
        runId: "run_1",
        threadId: "thread_1",
        trigger: "user_input",
        status: from as Run["status"],
        startedAt: new Date().toISOString(),
      };
      const next = transitionRun(run, to);

      expect(next.status).toBe(to);
    }
  });

  test("rejects a disallowed transition with a shared domain error", () => {
    const run = transitionRun(createRun({ runId: "run_1", threadId: "thread_1", trigger: "user_input" }), "completed");

    expect(() => transitionRun(run, "running")).toThrow(DomainError);
    expect(() => transitionRun(run, "running")).toThrow("invalid run transition from completed to running");
  });
});
