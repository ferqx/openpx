import { describe, expect, test } from "bun:test";
import type { ApprovalRequest } from "../../src/domain/approval";
import { createTask } from "../../src/domain/task";
import { createRun, transitionRun } from "../../src/domain/run";
import { createThread } from "../../src/domain/thread";
import {
  hasDurableBlockingState,
  resolveApprovalCommandContext,
  resolveApprovalTargetThread,
  resolveSubmitCommandContext,
  resolveSubmitTargetThread,
  shouldShortCircuitBlockedSubmit,
} from "../../src/kernel/session-command-handler";

describe("resolveSubmitTargetThread", () => {
  test("starts a new thread when no latest thread exists", async () => {
    const startedThread = createThread("thread-new", "/workspace", "project-1");

    const result = await resolveSubmitTargetThread({
      latestThread: undefined,
      latestRun: undefined,
      expectedRevision: undefined,
      startThread: async () => startedThread,
      saveThread: async () => undefined,
      ensureRevision: async () => undefined,
    });

    expect(result.thread.threadId).toBe("thread-new");
    expect(result.startedNewThread).toBe(true);
  });

  test("reuses and reactivates the latest idle thread", async () => {
    const latestThread = createThread("thread-existing", "/workspace", "project-1");
    const idleThread = { ...latestThread, status: "idle" as const };
    const savedThreads: string[] = [];

    const result = await resolveSubmitTargetThread({
      latestThread: idleThread,
      latestRun: transitionRun(
        transitionRun(createRun({ runId: "run-completed", threadId: idleThread.threadId, trigger: "user_input" }), "running"),
        "completed",
      ),
      expectedRevision: undefined,
      startThread: async () => {
        throw new Error("should not start a new thread");
      },
      saveThread: async (thread) => {
        savedThreads.push(thread.status);
      },
      ensureRevision: async () => undefined,
    });

    expect(result.thread.threadId).toBe("thread-existing");
    expect(result.thread.status).toBe("active");
    expect(result.startedNewThread).toBe(false);
    expect(savedThreads).toEqual(["active"]);
  });

  test("keeps a blocked thread blocked so human recovery is not bypassed", async () => {
    const latestThread = createThread("thread-blocked", "/workspace", "project-1");
    const savedThreads: string[] = [];
    const latestRun = transitionRun(
      transitionRun(createRun({ runId: "run-blocked", threadId: latestThread.threadId, trigger: "approval_resume" }), "running"),
      "blocked",
    );

    const result = await resolveSubmitTargetThread({
      latestThread,
      latestRun,
      expectedRevision: 3,
      startThread: async () => {
        throw new Error("should not start a new thread");
      },
      saveThread: async (thread) => {
        savedThreads.push(thread.status);
      },
      ensureRevision: async () => undefined,
    });

    expect(result.thread.threadId).toBe("thread-blocked");
    expect(result.thread.status).toBe("active");
    expect(result.startedNewThread).toBe(false);
    expect(savedThreads).toEqual([]);
  });

  test("starts a new thread when the latest run failed", async () => {
    const latestThread = createThread("thread-failed-run", "/workspace", "project-1");
    const startedThread = createThread("thread-new", "/workspace", "project-1");

    const result = await resolveSubmitTargetThread({
      latestThread,
      latestRun: transitionRun(
        transitionRun(createRun({ runId: "run-failed", threadId: latestThread.threadId, trigger: "user_input" }), "running"),
        "failed",
      ),
      expectedRevision: undefined,
      startThread: async () => startedThread,
      saveThread: async () => undefined,
      ensureRevision: async () => undefined,
    });

    expect(result.thread.threadId).toBe("thread-new");
    expect(result.startedNewThread).toBe(true);
  });

  test("detects durable blocking state from recovery facts and blocked tasks", () => {
    const task = {
      ...createTask("task-blocked", "thread-blocked", "run-blocked", "Recover risky patch"),
      status: "blocked" as const,
      blockingReason: {
        kind: "human_recovery" as const,
        message: "Manual recovery required.",
      },
    };

    expect(
      hasDurableBlockingState({
        thread: { recoveryFacts: undefined },
        tasks: [task],
      }),
    ).toBe(true);

    expect(
      hasDurableBlockingState({
        thread: {
          recoveryFacts: {
            threadId: "thread-blocked",
            revision: 1,
            schemaVersion: 1,
            status: "blocked",
            updatedAt: "2026-04-09T00:00:00.000Z",
            pendingApprovals: [],
            blocking: {
              sourceTaskId: "task-blocked",
              kind: "human_recovery",
              message: "Manual recovery required.",
            },
          },
        },
        tasks: [],
      }),
    ).toBe(true);
  });

  test("short-circuits submit while blocked by latest run or durable thread state", () => {
    const latestRun = transitionRun(
      transitionRun(createRun({ runId: "run-blocked", threadId: "thread-blocked", trigger: "user_input" }), "running"),
      "blocked",
    );

    expect(
      shouldShortCircuitBlockedSubmit({
        latestRun,
        thread: {},
        tasks: [],
      }),
    ).toBe(true);
  });

  test("resolves approval command context to the owning thread and latest run", async () => {
    const thread = createThread("thread-approval", "/workspace", "project-1");
    const latestRun = transitionRun(
      transitionRun(createRun({ runId: "run-approval", threadId: thread.threadId, trigger: "approval_resume" }), "running"),
      "waiting_approval",
    );
    const approval = {
      approvalRequestId: "approval-1",
      threadId: thread.threadId,
      runId: latestRun.runId,
      taskId: "task-1",
      toolCallId: "tool-1",
      toolRequest: {
        toolCallId: "tool-1",
        threadId: thread.threadId,
        runId: latestRun.runId,
        taskId: "task-1",
        toolName: "apply_patch",
        args: {},
      },
      summary: "apply_patch update_file src/app.ts",
      risk: "apply_patch.update_file",
      status: "pending",
    } satisfies ApprovalRequest;

    const result = await resolveApprovalTargetThread({
      approval,
      getThread: async () => thread,
      getLatestRunByThread: async () => latestRun,
    });

    expect(result.thread.threadId).toBe(thread.threadId);
    expect(result.latestRun?.runId).toBe(latestRun.runId);
  });

  test("builds submit command context with thread activity and blocked state", async () => {
    const thread = createThread("thread-submit", "/workspace", "project-1");
    const task = {
      ...createTask("task-blocked", thread.threadId, "run-1", "Wait for recovery"),
      status: "blocked" as const,
      blockingReason: {
        kind: "human_recovery" as const,
        message: "Manual recovery required.",
      },
    };
    const approval = {
      approvalRequestId: "approval-1",
      threadId: thread.threadId,
      runId: "run-1",
      taskId: task.taskId,
      toolCallId: "tool-1",
      toolRequest: {
        toolCallId: "tool-1",
        threadId: thread.threadId,
        runId: "run-1",
        taskId: task.taskId,
        toolName: "apply_patch",
        args: {},
      },
      summary: "apply_patch update_file src/app.ts",
      risk: "apply_patch.update_file",
      status: "pending",
    } satisfies ApprovalRequest;

    const result = await resolveSubmitCommandContext({
      latestThread: thread,
      expectedRevision: undefined,
      getLatestRunByThread: async () => undefined,
      listTasksByThread: async () => [task],
      listPendingApprovalsByThread: async () => [approval],
      startThread: async () => {
        throw new Error("should not start a new thread");
      },
      saveThread: async () => undefined,
      ensureRevision: async () => undefined,
    });

    expect(result.thread.threadId).toBe(thread.threadId);
    expect(result.tasks).toEqual([task]);
    expect(result.approvals).toEqual([approval]);
    expect(result.blocked).toBe(true);
  });

  test("builds approval command context with current tasks and approvals", async () => {
    const thread = createThread("thread-approval-context", "/workspace", "project-1");
    const latestRun = transitionRun(
      transitionRun(createRun({ runId: "run-approval-context", threadId: thread.threadId, trigger: "approval_resume" }), "running"),
      "waiting_approval",
    );
    const task = createTask("task-approval", thread.threadId, latestRun.runId, "Review requested patch");
    const approval = {
      approvalRequestId: "approval-ctx-1",
      threadId: thread.threadId,
      runId: latestRun.runId,
      taskId: task.taskId,
      toolCallId: "tool-ctx-1",
      toolRequest: {
        toolCallId: "tool-ctx-1",
        threadId: thread.threadId,
        runId: latestRun.runId,
        taskId: task.taskId,
        toolName: "apply_patch",
        args: {},
      },
      summary: "apply_patch update_file src/kernel.ts",
      risk: "apply_patch.update_file",
      status: "pending",
    } satisfies ApprovalRequest;

    const result = await resolveApprovalCommandContext({
      approvalRequestId: approval.approvalRequestId,
      getApproval: async () => approval,
      getThread: async () => thread,
      getLatestRunByThread: async () => latestRun,
      listTasksByThread: async () => [task],
      listPendingApprovalsByThread: async () => [approval],
    });

    expect(result.thread.threadId).toBe(thread.threadId);
    expect(result.latestRun?.runId).toBe(latestRun.runId);
    expect(result.tasks).toEqual([task]);
    expect(result.approvals).toEqual([approval]);
    expect(result.approval.approvalRequestId).toBe(approval.approvalRequestId);
  });
});
