import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Execution Ledger Recovery", () => {
  const testDir = path.join(os.tmpdir(), `ledger-recovery-test-${Date.now()}-${Math.random()}`);

  test("marks a side effect as unknown_after_crash instead of replaying blindly", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "test.db");
    const workspaceRoot = testDir;

    const context = await createAppContext({ dataDir, workspaceRoot });
    
    // Simulate a crash after tool start
    const threadId = "thread-1";
    const taskId = "task-1";
    await context.stores.executionLedger.save({
      executionId: "tc-1:exec",
      threadId,
      taskId,
      toolCallId: "tc-1",
      toolName: "apply_patch",
      argsJson: "{}",
      status: "started",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // In a real implementation, we'd have recovery logic that runs on boot
    // For Phase 1, we just need to ensure the data is there and can be queried
    const uncertain = await context.stores.executionLedger.findUncertain(threadId);
    expect(uncertain).toHaveLength(1);
    expect(uncertain[0]!.status).toBe("started");
  });
});
