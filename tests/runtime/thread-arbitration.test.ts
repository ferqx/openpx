import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createApprovalRequest } from "../../src/domain/approval";

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
    await context.stores.threadStore.save({ ...thread!, status: "blocked" });
    
    const rev1 = (await context.stores.threadStore.get(threadId))!.revision;

    // We need an approval request to call approve_request
    const approvalId = "app_1";
    await context.stores.approvalStore.save(createApprovalRequest({
      approvalRequestId: approvalId,
      threadId,
      taskId: "task_1",
      toolCallId: "tc_1",
      summary: "test",
      risk: "low",
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
    }));

    // A blocked thread mutation with a stale revision must be rejected.
    await expect(kernel.handleCommand({ type: "submit_input", payload: { text: "task 2" } }, rev1 - 1))
      .rejects.toThrow(/stale thread revision/);
  });
});
