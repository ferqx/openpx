import { describe, expect, test } from "bun:test";
import { runViewSchema } from "../../src/runtime/service/protocol/run-view";

describe("run protocol schema", () => {
  test("parses the minimal stable run view", () => {
    const parsed = runViewSchema.parse({
      runId: "run-1",
      threadId: "thread-1",
      status: "running",
      trigger: "user_input",
      startedAt: new Date().toISOString(),
    });

    expect(parsed.status).toBe("running");
    expect(parsed.trigger).toBe("user_input");
  });
});
