import { describe, expect, test } from "bun:test";
import { DomainError } from "../../src/shared/errors";
import { createThread, transitionThread, type Thread, type ThreadStatus } from "../../src/domain/thread";
import { threadId as sharedThreadId } from "../../src/shared/ids";

describe("thread transitions", () => {
  test("allows the declared transition matrix", () => {
    const cases: Array<[string, Parameters<typeof transitionThread>[1]]> = [
      ["active", "waiting_approval"],
      ["active", "interrupted"],
      ["active", "completed"],
      ["waiting_approval", "active"],
      ["interrupted", "completed"],
      ["completed", "active"],
      ["failed", "active"],
    ];

    for (const [from, to] of cases) {
      const thread = {
        threadId: sharedThreadId("thread_1"),
        workspaceRoot: "",
        projectId: "",
        revision: 1,
        status: from as Parameters<typeof transitionThread>[0]["status"],
      };
      const next = transitionThread(thread, to);

      expect(next.status).toBe(to);
    }
  });

  test("rejects a disallowed transition with a shared domain error", () => {
    const thread = createThread("thread_1");

    expect(() => transitionThread(thread, "idle")).toThrow(DomainError);
    expect(() => transitionThread(thread, "idle")).toThrow("invalid thread transition from active to idle");
  });
});
