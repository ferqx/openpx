import { describe, expect, test } from "bun:test";
import { createApprovalRequest } from "../../src/domain/approval";

describe("approval requests", () => {
  test("default to pending", () => {
    const approval = createApprovalRequest({
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
        args: {},
        action: "delete_file",
        path: "/tmp/demo.ts",
        changedFiles: 1,
      },
      summary: "delete file",
      risk: "apply_patch.delete_file",
    });

    expect(approval.approvalRequestId).toBe("approval_1");
    expect(approval.runId).toBe("run_1");
    expect(approval.status).toBe("pending");
    expect(approval.toolRequest.runId).toBe("run_1");
    expect(approval.toolRequest.toolName).toBe("apply_patch");
  });
});
