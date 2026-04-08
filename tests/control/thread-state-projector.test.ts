import { describe, expect, test } from "bun:test";
import { createThreadStateProjector } from "../../src/control/context/thread-state-projector";
import { createControlTask } from "../../src/control/tasks/task-types";
import { createApprovalRequest } from "../../src/domain/approval";
import type { DerivedThreadView } from "../../src/control/context/thread-compaction-types";

describe("ThreadStateProjector", () => {
  test("promotes completed tasks into stable recovery facts and narrative summaries", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {},
      {
        kind: "task",
        task: createControlTask({
          taskId: "task-2",
          threadId: "thread-1",
          summary: "Executor patched the runtime snapshot path.",
          status: "completed",
        }),
      },
    );

    expect(view.recoveryFacts?.activeTask).toBeUndefined();
    expect(view.recoveryFacts?.lastStableTask).toEqual(expect.objectContaining({
      taskId: "task-2",
      status: "completed",
      summary: "Executor patched the runtime snapshot path.",
    }));
    expect(view.narrativeState?.taskSummaries).toContain(
      "Executor patched the runtime snapshot path.",
    );
  });

  test("keeps blocked tasks as nonterminal active recovery state", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {},
      {
        kind: "task",
        task: createControlTask({
          taskId: "task-3",
          threadId: "thread-1",
          summary: "Waiting for manual database recovery.",
          status: "blocked",
          blockingReason: {
            kind: "human_recovery",
            message: "Waiting for manual database recovery.",
          },
        }),
      },
    );

    expect(view.recoveryFacts?.activeTask).toEqual(expect.objectContaining({
      taskId: "task-3",
      status: "blocked",
      summary: "Waiting for manual database recovery.",
    }));
    expect(view.recoveryFacts?.lastStableTask).toBeUndefined();
    expect(view.recoveryFacts?.blocking).toEqual({
      sourceTaskId: "task-3",
      kind: "human_recovery",
      message: "Waiting for manual database recovery.",
    });
  });

  test("uses task blocking metadata instead of hardcoded human recovery", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {},
      {
        kind: "task",
        task: createControlTask({
          taskId: "task-4",
          threadId: "thread-1",
          summary: "Delete tmp/output.txt is awaiting approval.",
          status: "blocked",
          blockingReason: {
            kind: "waiting_approval",
            message: "Delete tmp/output.txt is awaiting approval.",
          },
        }),
      },
    );

    expect(view.recoveryFacts?.blocking).toEqual({
      sourceTaskId: "task-4",
      kind: "waiting_approval",
      message: "Delete tmp/output.txt is awaiting approval.",
    });
  });

  test("moves pending approvals into recovery facts instead of narrative-only storage", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {},
      {
        kind: "approval",
        approval: createApprovalRequest({
          approvalRequestId: "approval-1",
          threadId: "thread-1",
          taskId: "task-1",
          toolCallId: "tool-call-1",
          toolRequest: {
            toolCallId: "tool-call-1",
            threadId: "thread-1",
            taskId: "task-1",
            toolName: "delete_file",
            args: { path: "tmp/output.txt" },
          },
          summary: "Delete tmp/output.txt",
          risk: "high",
        }),
      },
    );

    expect(view.recoveryFacts?.pendingApprovals).toHaveLength(1);
    expect(view.recoveryFacts?.blocking).toEqual({
      sourceTaskId: "task-1",
      kind: "waiting_approval",
      message: "Delete tmp/output.txt",
    });
    expect(view.narrativeState?.threadSummary ?? "").not.toContain("maybe blocked");
  });

  test("approval resolution clears stale pending and blocking recovery state", () => {
    const projector = createThreadStateProjector();
    const pendingApproval = createApprovalRequest({
      approvalRequestId: "approval-1",
      threadId: "thread-1",
      taskId: "task-1",
      toolCallId: "tool-call-1",
      toolRequest: {
        toolCallId: "tool-call-1",
        threadId: "thread-1",
        taskId: "task-1",
        toolName: "delete_file",
        args: { path: "tmp/output.txt" },
      },
      summary: "Delete tmp/output.txt",
      risk: "high",
    });

    const waitingView = projector.project({}, { kind: "approval", approval: pendingApproval });
    const resolvedView = projector.project(waitingView, {
      kind: "approval",
      approval: {
        ...pendingApproval,
        status: "approved",
      },
    });

    expect(resolvedView.recoveryFacts?.pendingApprovals).toEqual([]);
    expect(resolvedView.recoveryFacts?.blocking).toBeUndefined();
  });

  test("recomputes blocking from remaining pending approvals when one resolves", () => {
    const projector = createThreadStateProjector();
    const approvalA = createApprovalRequest({
      approvalRequestId: "approval-a",
      threadId: "thread-1",
      taskId: "task-a",
      toolCallId: "tool-call-a",
      toolRequest: {
        toolCallId: "tool-call-a",
        threadId: "thread-1",
        taskId: "task-a",
        toolName: "delete_file",
        args: { path: "tmp/a.txt" },
      },
      summary: "Delete tmp/a.txt",
      risk: "high",
    });
    const approvalB = createApprovalRequest({
      approvalRequestId: "approval-b",
      threadId: "thread-1",
      taskId: "task-b",
      toolCallId: "tool-call-b",
      toolRequest: {
        toolCallId: "tool-call-b",
        threadId: "thread-1",
        taskId: "task-b",
        toolName: "delete_file",
        args: { path: "tmp/b.txt" },
      },
      summary: "Delete tmp/b.txt",
      risk: "high",
    });

    const withApprovalA = projector.project({}, { kind: "approval", approval: approvalA });
    const withApprovalB = projector.project(withApprovalA, { kind: "approval", approval: approvalB });
    const afterResolveB = projector.project(withApprovalB, {
      kind: "approval",
      approval: {
        ...approvalB,
        status: "approved",
      },
    });

    expect(afterResolveB.recoveryFacts?.pendingApprovals).toEqual([
      expect.objectContaining({
        approvalRequestId: "approval-a",
        taskId: "task-a",
        toolCallId: "tool-call-a",
        summary: "Delete tmp/a.txt",
        risk: "high",
        status: "pending",
      }),
    ]);
    expect(afterResolveB.recoveryFacts?.blocking).toEqual({
      sourceTaskId: "task-a",
      kind: "waiting_approval",
      message: "Delete tmp/a.txt",
    });
  });

  test("task cancellation clears stale active and blocking recovery state", () => {
    const projector = createThreadStateProjector();
    const blockedView = projector.project(
      {},
      {
        kind: "task",
        task: createControlTask({
          taskId: "task-7",
          threadId: "thread-1",
          summary: "Waiting for operator intervention.",
          status: "blocked",
          blockingReason: {
            kind: "human_recovery",
            message: "Waiting for operator intervention.",
          },
        }),
      },
    );

    const cancelledView = projector.project(blockedView, {
      kind: "task",
      task: createControlTask({
        taskId: "task-7",
        threadId: "thread-1",
        summary: "Task cancelled by operator.",
        status: "cancelled",
      }),
    });

    expect(cancelledView.recoveryFacts?.activeTask).toBeUndefined();
    expect(cancelledView.recoveryFacts?.blocking).toBeUndefined();
    expect(cancelledView.recoveryFacts?.lastStableTask).toBeUndefined();
  });

  test("rejected approval followed by task cancellation does not leave the view blocked", () => {
    const projector = createThreadStateProjector();
    const pendingApproval = createApprovalRequest({
      approvalRequestId: "approval-2",
      threadId: "thread-1",
      taskId: "task-8",
      toolCallId: "tool-call-2",
      toolRequest: {
        toolCallId: "tool-call-2",
        threadId: "thread-1",
        taskId: "task-8",
        toolName: "delete_file",
        args: { path: "tmp/output.txt" },
      },
      summary: "Delete tmp/output.txt",
      risk: "high",
    });

    const waitingView = projector.project({}, { kind: "approval", approval: pendingApproval });
    const rejectedView = projector.project(waitingView, {
      kind: "approval",
      approval: {
        ...pendingApproval,
        status: "rejected",
      },
    });
    const cancelledView = projector.project(rejectedView, {
      kind: "task",
      task: createControlTask({
        taskId: "task-8",
        threadId: "thread-1",
        summary: "Task cancelled after rejection.",
        status: "cancelled",
      }),
    });

    expect(cancelledView.recoveryFacts?.pendingApprovals).toEqual([]);
    expect(cancelledView.recoveryFacts?.blocking).toBeUndefined();
    expect(cancelledView.recoveryFacts?.activeTask).toBeUndefined();
  });

  test("terminal task transitions remove same-task pending approvals and recompute blocking", () => {
    const projector = createThreadStateProjector();
    const approvalA = createApprovalRequest({
      approvalRequestId: "approval-task-10",
      threadId: "thread-1",
      taskId: "task-10",
      toolCallId: "tool-call-10",
      toolRequest: {
        toolCallId: "tool-call-10",
        threadId: "thread-1",
        taskId: "task-10",
        toolName: "delete_file",
        args: { path: "tmp/ten.txt" },
      },
      summary: "Delete tmp/ten.txt",
      risk: "high",
    });
    const approvalB = createApprovalRequest({
      approvalRequestId: "approval-task-11",
      threadId: "thread-1",
      taskId: "task-11",
      toolCallId: "tool-call-11",
      toolRequest: {
        toolCallId: "tool-call-11",
        threadId: "thread-1",
        taskId: "task-11",
        toolName: "delete_file",
        args: { path: "tmp/eleven.txt" },
      },
      summary: "Delete tmp/eleven.txt",
      risk: "high",
    });

    const withApprovalA = projector.project({}, { kind: "approval", approval: approvalA });
    const withApprovalB = projector.project(withApprovalA, { kind: "approval", approval: approvalB });
    const afterTaskComplete = projector.project(withApprovalB, {
      kind: "task",
      task: createControlTask({
        taskId: "task-11",
        threadId: "thread-1",
        summary: "Cleanup skipped after review.",
        status: "completed",
      }),
    });

    expect(afterTaskComplete.recoveryFacts?.pendingApprovals).toEqual([
      expect.objectContaining({
        approvalRequestId: "approval-task-10",
        taskId: "task-10",
        toolCallId: "tool-call-10",
        summary: "Delete tmp/ten.txt",
        risk: "high",
        status: "pending",
      }),
    ]);
    expect(afterTaskComplete.recoveryFacts?.blocking).toEqual({
      sourceTaskId: "task-10",
      kind: "waiting_approval",
      message: "Delete tmp/ten.txt",
    });
  });

  test("keeps large tool output in the working set window", () => {
    const projector = createThreadStateProjector();
    const toolResult = Array.from({ length: 80 }, (_, index) => `line ${index}`).join("\n");
    const view = projector.project(
      {},
      {
        kind: "tool_result",
        content: toolResult,
      },
    );

    expect(view.workingSetWindow?.toolResults).toEqual([toolResult]);
    expect(view.narrativeState?.taskSummaries ?? []).toHaveLength(0);
  });

  test("keeps short tool output out of durable narrative state", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {},
      {
        kind: "tool_result",
        content: "ok",
      },
    );

    expect(view.workingSetWindow?.toolResults).toEqual(["ok"]);
    expect(view.narrativeState?.notableEvents).toEqual([]);
    expect(view.narrativeState?.threadSummary).toBe("");
  });

  test("projects answers into durable answer recovery facts and thread narrative", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {},
      {
        kind: "answer",
        answerId: "answer-1",
        summary: "Runtime snapshot path updated.",
      },
    );

    expect(view.recoveryFacts?.latestDurableAnswer).toEqual(expect.objectContaining({
      answerId: "answer-1",
      summary: "Runtime snapshot path updated.",
    }));
    expect(view.narrativeState?.notableEvents).toContain("Runtime snapshot path updated.");
    expect(view.narrativeState?.threadSummary).toBe("Runtime snapshot path updated.");
  });

  test("preserves narrative summary insertion order across task and non-task candidates", () => {
    const projector = createThreadStateProjector();
    const afterTaskOne = projector.project(
      {},
      {
        kind: "task",
        task: createControlTask({
          taskId: "task-order-1",
          threadId: "thread-1",
          summary: "Initial repository scan complete.",
          status: "completed",
        }),
      },
    );
    const afterAnswer = projector.project(afterTaskOne, {
      kind: "answer",
      answerId: "answer-order-1",
      summary: "Answer summarized the scan results.",
    });
    const afterTaskTwo = projector.project(afterAnswer, {
      kind: "task",
      task: createControlTask({
        taskId: "task-order-2",
        threadId: "thread-1",
        summary: "Follow-up patch applied.",
        status: "completed",
      }),
    });

    expect(afterTaskTwo.narrativeState?.threadSummary).toBe(
      "Initial repository scan complete.; Answer summarized the scan results.; Follow-up patch applied.",
    );
  });

  test("projects blocking events into recovery facts and narrative state", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {},
      {
        kind: "event",
        eventType: "thread.waiting_approval",
        sourceTaskId: "task-9",
        summary: "Waiting on cleanup approval.",
      },
    );

    expect(view.recoveryFacts?.blocking).toEqual({
      sourceTaskId: "task-9",
      kind: "waiting_approval",
      message: "Waiting on cleanup approval.",
    });
    expect(view.narrativeState?.notableEvents).toContain("Waiting on cleanup approval.");
    expect(view.narrativeState?.threadSummary).toBe("Waiting on cleanup approval.");
  });

  test("source-less blocking events update narrative without creating sticky blocking facts", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {},
      {
        kind: "event",
        eventType: "thread.waiting_approval",
        summary: "Approval required before continuing.",
      },
    );

    expect(view.recoveryFacts?.blocking).toBeUndefined();
    expect(view.narrativeState?.notableEvents).toContain("Approval required before continuing.");
    expect(view.narrativeState?.threadSummary).toBe("Approval required before continuing.");
  });

  test("projects transient events into the working-set window", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {},
      {
        kind: "event",
        eventType: "thread.tick",
        summary: "Executor heartbeat",
      },
    );

    expect(view.workingSetWindow?.messages).toContain("Executor heartbeat");
    expect(view.recoveryFacts?.blocking).toBeUndefined();
  });

  test("approved approval clears contradictory blocked active task state", () => {
    const projector = createThreadStateProjector();
    const blockedView = projector.project(
      {},
      {
        kind: "task",
        task: createControlTask({
          taskId: "task-approval-1",
          threadId: "thread-1",
          summary: "Waiting for delete approval.",
          status: "blocked",
          blockingReason: {
            kind: "waiting_approval",
            message: "Waiting for delete approval.",
          },
        }),
      },
    );
    const pendingApproval = createApprovalRequest({
      approvalRequestId: "approval-blocked-1",
      threadId: "thread-1",
      taskId: "task-approval-1",
      toolCallId: "tool-call-blocked-1",
      toolRequest: {
        toolCallId: "tool-call-blocked-1",
        threadId: "thread-1",
        taskId: "task-approval-1",
        toolName: "delete_file",
        args: { path: "tmp/delete.txt" },
      },
      summary: "Delete tmp/delete.txt",
      risk: "high",
    });

    const waitingApprovalView = projector.project(blockedView, {
      kind: "approval",
      approval: pendingApproval,
    });
    const approvedView = projector.project(waitingApprovalView, {
      kind: "approval",
      approval: {
        ...pendingApproval,
        status: "approved",
      },
    });

    expect(approvedView.recoveryFacts?.blocking).toBeUndefined();
    expect(approvedView.recoveryFacts?.activeTask).toBeUndefined();
  });

  test("running task clears stale same-task blocking when it resumes", () => {
    const projector = createThreadStateProjector();
    const blockedView = projector.project(
      {},
      {
        kind: "task",
        task: createControlTask({
          taskId: "task-unblock-1",
          threadId: "thread-1",
          summary: "Waiting on temporary blocker.",
          status: "blocked",
          blockingReason: {
            kind: "human_recovery",
            message: "Waiting on temporary blocker.",
          },
        }),
      },
    );

    const runningView = projector.project(blockedView, {
      kind: "task",
      task: createControlTask({
        taskId: "task-unblock-1",
        threadId: "thread-1",
        summary: "Work resumed.",
        status: "running",
      }),
    });

    expect(runningView.recoveryFacts?.activeTask).toEqual(expect.objectContaining({
      taskId: "task-unblock-1",
      status: "running",
      summary: "Work resumed.",
    }));
    expect(runningView.recoveryFacts?.blocking).toBeUndefined();
  });

  test("caps transcript history to the most recent messages", () => {
    const projector = createThreadStateProjector();
    let view: DerivedThreadView = {};

    for (let index = 0; index < 60; index += 1) {
      view = projector.project(view, {
        kind: "transcript_message",
        messageId: `message-${index}`,
        role: index % 2 === 0 ? "user" : "assistant",
        content: `message ${index}`,
      });
    }

    expect(view.recoveryFacts?.conversationHistory).toHaveLength(40);
    expect(view.recoveryFacts?.conversationHistory?.[0]?.messageId).toBe("message-20");
    expect(view.recoveryFacts?.conversationHistory?.at(-1)?.messageId).toBe("message-59");
  });
});

  test("tool_executed updates ledgerState with lastCompletedToolCallId", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {
        recoveryFacts: {
          threadId: "thread-1",
          revision: 0,
          schemaVersion: 1,
          status: "active",
          updatedAt: new Date().toISOString(),
          pendingApprovals: [],
        },
      },
      {
        kind: "tool_executed",
        toolCallId: "tool-123",
        toolName: "apply_patch",
      },
    );

    expect(view.recoveryFacts?.ledgerState).toEqual({
      lastCompletedToolCallId: "tool-123",
      pendingToolCallId: undefined,
    });
  });

  test("tool_pending updates ledgerState with pendingToolCallId", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {
        recoveryFacts: {
          threadId: "thread-1",
          revision: 0,
          schemaVersion: 1,
          status: "active",
          updatedAt: new Date().toISOString(),
          pendingApprovals: [],
        },
      },
      {
        kind: "tool_pending",
        toolCallId: "tool-456",
        toolName: "exec",
      },
    );

    expect(view.recoveryFacts?.ledgerState).toEqual({
      pendingToolCallId: "tool-456",
    });
  });

  test("tool_blocked updates ledgerState with pendingToolCallId", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {
        recoveryFacts: {
          threadId: "thread-1",
          revision: 0,
          schemaVersion: 1,
          status: "active",
          updatedAt: new Date().toISOString(),
          pendingApprovals: [],
        },
      },
      {
        kind: "tool_blocked",
        toolCallId: "tool-789",
        toolName: "apply_patch",
      },
    );

    expect(view.recoveryFacts?.ledgerState).toEqual({
      pendingToolCallId: "tool-789",
    });
  });

  test("tool_failed clears pendingToolCallId", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {
        recoveryFacts: {
          threadId: "thread-1",
          revision: 0,
          schemaVersion: 1,
          status: "active",
          updatedAt: new Date().toISOString(),
          pendingApprovals: [],
          ledgerState: {
            pendingToolCallId: "tool-456",
          },
        },
      },
      {
        kind: "tool_failed",
        toolCallId: "tool-456",
        toolName: "exec",
      },
    );

    expect(view.recoveryFacts?.ledgerState).toEqual({
      pendingToolCallId: undefined,
    });
  });

  test("tool_executed after tool_pending clears pending and sets completed", () => {
    const projector = createThreadStateProjector();
    let view = projector.project(
      {
        recoveryFacts: {
          threadId: "thread-1",
          revision: 0,
          schemaVersion: 1,
          status: "active",
          updatedAt: new Date().toISOString(),
          pendingApprovals: [],
        },
      },
      {
        kind: "tool_pending",
        toolCallId: "tool-001",
        toolName: "apply_patch",
      },
    );

    expect(view.recoveryFacts?.ledgerState?.pendingToolCallId).toBe("tool-001");

    view = projector.project(view, {
      kind: "tool_executed",
      toolCallId: "tool-001",
      toolName: "apply_patch",
    });

    expect(view.recoveryFacts?.ledgerState).toEqual({
      lastCompletedToolCallId: "tool-001",
      pendingToolCallId: undefined,
    });
  });
