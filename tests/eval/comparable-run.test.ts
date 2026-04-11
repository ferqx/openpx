import { describe, expect, test } from "bun:test";
import { createApprovalRequest } from "../../src/domain/approval";
import { createEvent } from "../../src/domain/event";
import { createRun, transitionRun } from "../../src/domain/run";
import { createTask } from "../../src/domain/task";
import { createThread } from "../../src/domain/thread";
import { normalizeComparableRun } from "../../src/eval/comparable-run";
import type { ExecutionLedgerEntry } from "../../src/persistence/ports/execution-ledger-port";

describe("normalizeComparableRun", () => {
  test("normalizes rejection and replan semantics into stable aliases", () => {
    const thread = createThread("thread_reject", "/tmp/openpx", "project-openpx");
    const waitingRun = transitionRun(
      transitionRun(
        createRun({
          runId: "run_waiting",
          threadId: thread.threadId,
          trigger: "approval_resume",
          inputText: "delete src/legacy-delete.ts",
        }),
        "running",
      ),
      "waiting_approval",
    );
    const replannedRun = transitionRun(
      transitionRun(
        createRun({
          runId: "run_replanned",
          threadId: thread.threadId,
          trigger: "user_input",
          inputText: "Tool approval was rejected for proposal apply_patch_delete_file_src_legacy_delete_ts. Replan safely without repeating that proposal.",
        }),
        "running",
      ),
      "completed",
    );

    const blockedTask = {
      ...createTask("task_waiting", thread.threadId, waitingRun.runId, "Delete legacy file"),
      status: "cancelled" as const,
      blockingReason: {
        kind: "waiting_approval" as const,
        message: "apply_patch delete_file src/legacy-delete.ts",
      },
    };
    const replannedTask = {
      ...createTask("task_replanned", thread.threadId, replannedRun.runId, "Replan after rejected delete"),
      status: "completed" as const,
    };

    const approval = {
      ...createApprovalRequest({
        approvalRequestId: "approval_reject",
        threadId: thread.threadId,
        runId: waitingRun.runId,
        taskId: blockedTask.taskId,
        toolCallId: "tool_delete",
        toolRequest: {
          toolCallId: "tool_delete",
          threadId: thread.threadId,
          runId: waitingRun.runId,
          taskId: blockedTask.taskId,
          toolName: "apply_patch",
          args: {},
          action: "delete_file",
          path: "/tmp/openpx/src/legacy-delete.ts",
          changedFiles: 1,
        },
        summary: "apply_patch delete_file src/legacy-delete.ts",
        risk: "apply_patch.delete_file",
      }),
      status: "rejected" as const,
    };

    const events = [
      createEvent({
        eventId: "event_thread_blocked",
        threadId: thread.threadId,
        taskId: blockedTask.taskId,
        type: "thread.blocked",
        payload: {
          threadId: thread.threadId,
          status: thread.status,
          blockingReason: blockedTask.blockingReason,
        },
      }),
      createEvent({
        eventId: "event_task_cancelled",
        threadId: thread.threadId,
        taskId: blockedTask.taskId,
        type: "task.updated",
        payload: {
          taskId: blockedTask.taskId,
          threadId: thread.threadId,
          runId: waitingRun.runId,
          status: blockedTask.status,
          blockingReason: blockedTask.blockingReason,
        },
      }),
      createEvent({
        eventId: "event_task_completed",
        threadId: thread.threadId,
        taskId: replannedTask.taskId,
        type: "task.completed",
        payload: {
          taskId: replannedTask.taskId,
          threadId: thread.threadId,
          runId: replannedRun.runId,
          status: replannedTask.status,
        },
      }),
    ];

    const comparable = normalizeComparableRun({
      thread,
      runs: [waitingRun, replannedRun],
      tasks: [blockedTask, replannedTask],
      approvals: [approval],
      events,
      ledgerEntries: [],
    });

    expect(comparable.runtimeRefs.threadId).toBe(thread.threadId);
    expect(comparable.runLineage.map((run) => run.alias)).toEqual(["run_1", "run_2"]);
    expect(comparable.taskLineage.map((task) => task.alias)).toEqual(["task_1", "task_2"]);
    expect(comparable.approvalFlow.resolution).toBe("rejected");
    expect(comparable.approvalFlow.reroutedToPlanner).toBe(true);
    expect(comparable.approvalFlow.rejectionReason).toContain("Tool approval was rejected for proposal");
    expect(comparable.eventMilestones.threadBlockedCount).toBe(1);
    expect(comparable.eventMilestones.taskCompletedCount).toBe(1);
  });

  test("detects reroute-to-planner for capability-based rejection reasons", () => {
    const thread = createThread("thread_reject_capability", "/tmp/openpx", "project-openpx");
    const waitingRun = transitionRun(
      transitionRun(
        createRun({
          runId: "run_waiting_capability",
          threadId: thread.threadId,
          trigger: "approval_resume",
          inputText: "delete src/approval-target.ts",
        }),
        "running",
      ),
      "waiting_approval",
    );
    const replannedRun = transitionRun(
      transitionRun(
        createRun({
          runId: "run_replanned_capability",
          threadId: thread.threadId,
          trigger: "user_input",
          inputText: "Tool approval was rejected for capability apply_patch.delete_file. Original summary: apply_patch delete_file src/approval-target.ts. Replan safely with avoid_same_capability_marker.",
        }),
        "running",
      ),
      "completed",
    );

    const blockedTask = {
      ...createTask("task_waiting_capability", thread.threadId, waitingRun.runId, "Delete approval target"),
      status: "cancelled" as const,
      blockingReason: {
        kind: "waiting_approval" as const,
        message: "apply_patch delete_file src/approval-target.ts",
      },
    };
    const replannedTask = {
      ...createTask("task_replanned_capability", thread.threadId, replannedRun.runId, "Safe replan"),
      status: "completed" as const,
    };

    const approval = {
      ...createApprovalRequest({
        approvalRequestId: "approval_reject_capability",
        threadId: thread.threadId,
        runId: waitingRun.runId,
        taskId: blockedTask.taskId,
        toolCallId: "tool_delete_capability",
        toolRequest: {
          toolCallId: "tool_delete_capability",
          threadId: thread.threadId,
          runId: waitingRun.runId,
          taskId: blockedTask.taskId,
          toolName: "apply_patch",
          args: {},
          action: "delete_file",
          path: "/tmp/openpx/src/approval-target.ts",
          changedFiles: 1,
        },
        summary: "apply_patch delete_file src/approval-target.ts",
        risk: "apply_patch.delete_file",
      }),
      status: "rejected" as const,
    };

    const comparable = normalizeComparableRun({
      thread,
      runs: [waitingRun, replannedRun],
      tasks: [blockedTask, replannedTask],
      approvals: [approval],
      events: [],
      ledgerEntries: [],
    });

    expect(comparable.approvalFlow.rejectionReason).toContain("Tool approval was rejected for capability");
    expect(comparable.approvalFlow.reroutedToPlanner).toBe(true);
    expect(comparable.approvalFlow.graphResumeDetected).toBe(true);
  });

  test("detects recovery and duplicate side-effect signals", () => {
    const thread = {
      ...createThread("thread_recovery", "/tmp/openpx", "project-openpx"),
      recoveryFacts: {
        threadId: "thread_recovery",
        revision: 1,
        schemaVersion: 1,
        status: "active",
        updatedAt: "2026-04-09T00:00:00.000Z",
        blocking: {
          sourceTaskId: "task_recovery",
          kind: "human_recovery" as const,
          message: "Manual recovery required for apply_patch; previous execution outcome is uncertain after a crash.",
        },
        pendingApprovals: [],
      },
    };
    const interruptedRun = transitionRun(
      transitionRun(
        createRun({
          runId: "run_interrupted",
          threadId: thread.threadId,
          trigger: "interrupt_resume",
          inputText: "continue execution",
        }),
        "running",
      ),
      "interrupted",
    );
    const resumedRun = transitionRun(
      transitionRun(
        createRun({
          runId: "run_resumed",
          threadId: thread.threadId,
          trigger: "system_resume",
          inputText: "recover after uncertain execution",
        }),
        "running",
      ),
      "blocked",
    );

    const recoveryTask = {
      ...createTask("task_recovery", thread.threadId, resumedRun.runId, "Recover after crash"),
      status: "blocked" as const,
      blockingReason: {
        kind: "human_recovery" as const,
        message: "Manual recovery required for apply_patch; previous execution outcome is uncertain after a crash.",
      },
    };

    const ledgerEntries: ExecutionLedgerEntry[] = [
      {
        executionId: "execution_1",
        threadId: thread.threadId,
        runId: interruptedRun.runId,
        taskId: recoveryTask.taskId,
        toolCallId: "task_recovery:apply_patch",
        toolName: "apply_patch",
        argsJson: "{}",
        status: "unknown_after_crash",
        createdAt: "2026-04-09T00:00:00.000Z",
        updatedAt: "2026-04-09T00:00:00.000Z",
      },
      {
        executionId: "execution_2",
        threadId: thread.threadId,
        runId: resumedRun.runId,
        taskId: recoveryTask.taskId,
        toolCallId: "task_recovery:apply_patch",
        toolName: "apply_patch",
        argsJson: "{}",
        status: "completed",
        createdAt: "2026-04-09T00:01:00.000Z",
        updatedAt: "2026-04-09T00:01:00.000Z",
      },
      {
        executionId: "execution_3",
        threadId: thread.threadId,
        runId: resumedRun.runId,
        taskId: recoveryTask.taskId,
        toolCallId: "task_recovery:apply_patch",
        toolName: "apply_patch",
        argsJson: "{}",
        status: "completed",
        createdAt: "2026-04-09T00:02:00.000Z",
        updatedAt: "2026-04-09T00:02:00.000Z",
      },
    ];

    const comparable = normalizeComparableRun({
      thread,
      runs: [interruptedRun, resumedRun],
      tasks: [recoveryTask],
      approvals: [],
      events: [],
      ledgerEntries,
    });

    expect(comparable.recoveryFlow.humanRecoveryTriggered).toBe(true);
    expect(comparable.recoveryFlow.uncertainExecutionCount).toBe(1);
    expect(comparable.recoveryFlow.interruptedRunAliases).toEqual(["run_1"]);
    expect(comparable.recoveryFlow.resumedRunAliases).toEqual(["run_2"]);
    expect(comparable.sideEffects.duplicateCompletedToolCallAliases).toEqual(["tool_call_1"]);
  });
});
