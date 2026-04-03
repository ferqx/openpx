import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Thread Arbitration", () => {
  test("rejects a mutation against a stale thread revision", async () => {
    const testDir = path.join(os.tmpdir(), `thread-arbitration-test-${Date.now()}-${Math.random()}`);
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "test.db");
    const workspaceRoot = testDir;

    const context = await createAppContext({ dataDir, workspaceRoot });
    const { kernel } = context;

    // Start a thread that will block on approval (if we mock it)
    // For now, let's just manually set it to waiting_approval
    await kernel.handleCommand({ type: "submit_input", payload: { text: "task 1" } });
    const state1 = await kernel.hydrateSession();
    const threadId = state1!.threadId;
    const thread = await context.stores.threadStore.get(threadId);
    await context.stores.threadStore.save({ ...thread!, status: "waiting_approval" });
    
    const rev1 = (await context.stores.threadStore.get(threadId))!.revision;

    // We need an approval request to call approve_request
    const approvalId = "app_1";
    await context.stores.approvalStore.save({
      approvalRequestId: approvalId,
      threadId,
      taskId: "task_1",
      toolCallId: "tc_1",
      summary: "test",
      risk: "low",
      status: "pending",
      toolRequest: {
        toolCallId: "tc_1",
        threadId,
        taskId: "task_1",
        toolName: "apply_patch",
        args: { content: "test content" },
        action: "create_file",
        path: path.join(workspaceRoot, "test.txt"),
        changedFiles: 1
      }
    } as any);

    // Move to next revision
    await kernel.handleCommand({ type: "approve_request", payload: { approvalRequestId: approvalId } });
    const rev2 = (await context.stores.threadStore.get(threadId))!.revision;
    expect(rev2).toBeGreaterThan(rev1);

    // Try to send command with stale revision
    await expect(kernel.handleCommand({ type: "approve_request", payload: { approvalRequestId: approvalId } }, rev1))
      .rejects.toThrow(/stale thread revision/);
  });
});
