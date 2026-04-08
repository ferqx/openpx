import { describe, expect, test } from "bun:test";
import { createApprovalRequest } from "../../src/domain/approval";
import { SqliteApprovalStore } from "../../src/persistence/sqlite/sqlite-approval-store";

describe("SqliteApprovalStore", () => {
  test("persists and reloads approvals with run scope", async () => {
    const store = new SqliteApprovalStore(":memory:");

    const request = createApprovalRequest({
      approvalRequestId: "approval_1",
      threadId: "thread_1",
      runId: "run_1",
      taskId: "task_1",
      toolCallId: "tool_1",
      toolRequest: {
        toolCallId: "tool_1",
        threadId: "thread_1",
        runId: "run_1",
        taskId: "task_1",
        toolName: "apply_patch",
        args: { content: "x" },
      },
      summary: "apply patch",
      risk: "apply_patch.medium",
    });

    await store.save(request);

    const approval = await store.get("approval_1");

    expect(approval?.runId).toBe("run_1");
    expect(approval?.toolRequest.runId).toBe("run_1");
    expect(approval?.status).toBe("pending");
  });
});
