import { describe, expect, test } from "bun:test";
import {
  buildApprovalContinuation,
  createApprovalSuspension,
  resolveSuspensionAfterApproval,
} from "../../../src/harness/core/run-loop/approval-suspension";

describe("run-loop approval suspension", () => {
  test("为待审批动作生成显式挂起记录", () => {
    const suspension = createApprovalSuspension({
      threadId: "thread_1",
      runId: "run_1",
      taskId: "task_1",
      step: "execute",
      summary: "Approval required before deleting approved.txt",
      approvalRequestId: "approval_1",
    });

    expect(suspension.threadId).toBe("thread_1");
    expect(suspension.runId).toBe("run_1");
    expect(suspension.taskId).toBe("task_1");
    expect(suspension.reasonKind).toBe("waiting_approval");
    expect(suspension.resumeStep).toBe("execute");
    expect(suspension.approvalRequestId).toBe("approval_1");
  });

  test("批准后从原步骤继续执行", () => {
    const continuation = buildApprovalContinuation({
      threadId: "thread_1",
      runId: "run_1",
      taskId: "task_1",
      approvalRequestId: "approval_1",
      decision: "approved",
      step: "execute",
    });
    const result = resolveSuspensionAfterApproval({
      suspension: createApprovalSuspension({
        threadId: "thread_1",
        runId: "run_1",
        taskId: "task_1",
        step: "execute",
        summary: "Approval required before deleting approved.txt",
        approvalRequestId: "approval_1",
      }),
      continuation,
      originalInput: "clean up approved artifact",
    });

    expect(result.nextStep).toBe("execute");
    expect(result.input).toBe("clean up approved artifact");
    expect(result.approvedApprovalRequestId).toBe("approval_1");
  });

  test("拒绝后回到 plan，并优先使用 rejection reason", () => {
    const continuation = buildApprovalContinuation({
      threadId: "thread_1",
      runId: "run_1",
      taskId: "task_1",
      approvalRequestId: "approval_1",
      decision: "rejected",
      reason: "continue safely without deleting files",
      step: "plan",
    });
    const result = resolveSuspensionAfterApproval({
      suspension: createApprovalSuspension({
        threadId: "thread_1",
        runId: "run_1",
        taskId: "task_1",
        step: "execute",
        summary: "Approval required before deleting approved.txt",
        approvalRequestId: "approval_1",
      }),
      continuation,
      originalInput: "clean up approved artifact",
    });

    expect(result.nextStep).toBe("plan");
    expect(result.input).toBe("continue safely without deleting files");
    expect(result.approvedApprovalRequestId).toBeUndefined();
  });
});
