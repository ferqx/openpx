import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";
import { RuntimeScopedSession } from "../../src/runtime/service/runtime-scoped-session";
import { nextId } from "../../src/shared/ids";

/**
 * INTEGRATION SMOKE TEST: TUI -> KERNEL RESPONSIVENESS
 * Verifies that handleCommand returns a structured session payload synchronously.
 */
describe("Kernel-TUI Response Loop", () => {
  test("synchronously returns structured thread view on task submission", async () => {
    const workspaceRoot = "/tmp/test-resp";
    const dataDir = ":memory:";
    const context = await createAppContext({ workspaceRoot, dataDir });
    
    const session = new RuntimeScopedSession(
      { workspaceRoot, projectId: "test-p" },
      context
    );

    // 1. Simulate TUI submitting a task
    const result = await session.handleCommand({
      kind: "add_task",
      content: "Hello Test",
      background: false
    });

    // 2. ASSERTIONS: The response must be a structured session payload
    expect(result).toBeDefined();
    expect(result.status).toBeDefined();
    expect(result.threadId).toBeDefined();
    expect(result.threadId?.startsWith("thread_")).toBe(true);
  });
});
