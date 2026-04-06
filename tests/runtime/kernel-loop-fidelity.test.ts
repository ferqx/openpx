import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";
import { RuntimeScopedSession } from "../../src/runtime/service/runtime-scoped-session";

describe("Kernel Loop Fidelity (Fixing Spam and Blocking)", () => {
  test("simple input does not trigger manual recovery block", async () => {
    const workspaceRoot = "/tmp/test-fidelity";
    const dataDir = ":memory:";
    const context = await createAppContext({ workspaceRoot, dataDir });
    
    const session = new RuntimeScopedSession(
      { workspaceRoot, projectId: "test-p" },
      context
    );

    // 1. Submit a simple greeting
    const result = await session.handleCommand({
      kind: "add_task",
      content: "Hi",
      background: false
    });

    // 2. ASSERTIONS
    // - Should NOT be blocked
    expect(result.status).not.toBe("blocked" as any);
    expect(result.recoveryFacts?.blocking).toBeUndefined();
    
    // - Should use RESPOND mode (semantic reply)
    // We check this by verifying it's not a mirror
    expect(result.recoveryFacts?.latestDurableAnswer?.summary.toLowerCase()).not.toBe("hi");
  }, 60000);

  test("deduplicates narrative summaries on multiple rounds", async () => {
    const workspaceRoot = "/tmp/test-dedupe";
    const dataDir = ":memory:";
    const context = await createAppContext({ workspaceRoot, dataDir });
    
    const session = new RuntimeScopedSession(
      { workspaceRoot, projectId: "test-p" },
      context
    );

    // Round 1
    await session.handleCommand({ kind: "add_task", content: "Task A", background: false });
    // Round 2 (Same task summary)
    const result2 = await session.handleCommand({ kind: "add_task", content: "Task A", background: false });

    // Narrative should NOT repeat "Task A; Task A"
    const summary = result2.narrativeState?.threadSummary ?? "";
    const count = (summary.match(/Task A/g) || []).length;
    // Note: Some models might add 'Task A' to the summary in different words, 
    // but our projector-level endswith check should handle direct repetition.
    expect(count).toBeLessThanOrEqual(1);
  }, 60000);
});
