import { describe, expect, test } from "bun:test";
import { createApprovalRequest } from "../../src/domain/approval";

describe("approval requests", () => {
  test("default to pending", () => {
    const approval = createApprovalRequest({
      approvalRequestId: "approval_1",
      threadId: "thread_1",
      taskId: "task_1",
      toolCallId: "tool_1",
      summary: "delete file",
      risk: "apply_patch.delete_file",
    });

    expect(approval.approvalRequestId).toBe("approval_1");
    expect(approval.status).toBe("pending");
  });
});
