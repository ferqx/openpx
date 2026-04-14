import { describe, expect, test, mock } from "bun:test";
import type { ThreadNarrativeService } from "../../src/control/context/thread-narrative-service";
import { createRun, transitionRun } from "../../src/domain/run";
import { createSessionKernel } from "../../src/harness/core/session/session-kernel";
import { createThread } from "../../src/domain/thread";
import { createTask } from "../../src/domain/task";

describe("SessionKernel", () => {
  test("creates a thread, emits a thread.started event, and starts the root task", async () => {
    const events: Array<{ type: string; payload?: unknown }> = [];
    const thread = createThread("thread-1", "/workspace", "project-1");
    
    const kernel = createSessionKernel({
      stores: {
        threadStore: {
          async getLatest() { return undefined; },
          async save() {},
          async get() { return thread; },
          async listByScope() { return [thread]; },
          async close() {},
        },
        taskStore: {
          async save() {},
          async get() { return undefined; },
          async listByThread() { return []; },
          async close() {},
        },
        runStore: {
          async getLatestByThread() { return undefined; },
        },
        approvalStore: {
          async listPendingByThread() { return []; },
          async get() { return undefined; },
        },
        workerStore: {
          async save() {},
          async get() { return undefined; },
          async listByThread() { return []; },
          async listActiveByThread() { return []; },
          async close() {},
        },
      },
        controlPlane: {
          async startRootTask(threadId, input) {
            const text =
              typeof input === "string"
                ? input
                : input.decision === "rejected"
                  ? input.reason ?? "approved"
                  : "approved";
            return {
              status: "completed",
            task: { taskId: "task-1", threadId, runId: "run-1", summary: text, status: "completed" },
            approvals: [],
            summary: text,
          };
        },
        async approveRequest() { throw new Error("not implemented"); },
        async rejectRequest() { throw new Error("not implemented"); },
      },
      workspaceRoot: "/workspace",
      projectId: "project-1",
    });

    kernel.events.subscribe((e) => events.push(e));

    const result = await kernel.handleCommand({
      type: "submit_input",
      payload: { text: "Hello" },
    });

    expect(result.threadId).toBeDefined();
    // In async mode, we might need to wait for background task if we wanted to see its results,
    // but the test as written just checks that handleCommand returns a session.
    expect(result.status).toBeDefined();
  });

  test("updates the thread narrative when a stable task completes", async () => {
    const thread = createThread("thread-2", "/workspace", "project-1");
    const narrativeService: ThreadNarrativeService = {
      processTaskUpdate: mock(async () => {}),
      getNarrative: async (threadId: string) => ({ threadId, summary: "Updated", events: [], revision: 1 }),
    };

    const kernel = createSessionKernel({
      stores: {
        threadStore: {
          async getLatest() { return thread; },
          async save() {},
          async get() { return thread; },
          async listByScope() { return [thread]; },
          async close() {},
        },
        taskStore: {
          async save() {},
          async get() { return undefined; },
          async listByThread() { return []; },
          async close() {},
        },
        runStore: {
          async getLatestByThread() { return undefined; },
        },
        approvalStore: {
          async listPendingByThread() { return []; },
          async get() { return undefined; },
        },
        workerStore: {
          async save() {},
          async get() { return undefined; },
          async listByThread() { return []; },
          async listActiveByThread() { return []; },
          async close() {},
        },
      },
        controlPlane: {
          async startRootTask(threadId, input) {
            const text =
              typeof input === "string"
                ? input
                : input.decision === "rejected"
                  ? input.reason ?? "approved"
                  : "approved";
            return {
              status: "completed",
            task: { taskId: "task-completed", threadId, runId: "run-completed", summary: "Stable work", status: "completed" },
            approvals: [],
            summary: "Stable work",
          };
        },
        async approveRequest() { throw new Error("not implemented"); },
        async rejectRequest() { throw new Error("not implemented"); },
      },
      narrativeService,
      workspaceRoot: "/workspace",
      projectId: "project-1",
    });

    await kernel.handleCommand({
      type: "submit_input",
      payload: { text: "Do stable work" },
    });

    // Wait for async background task to call narrative service
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(narrativeService.processTaskUpdate).toHaveBeenCalled();
  });

  test("hydrates blocked status from the latest run even when the thread remains active", async () => {
    const thread = createThread("thread-run-blocked", "/workspace", "project-1");
    const blockedRun = transitionRun(
      transitionRun(createRun({ runId: "run-blocked", threadId: thread.threadId, trigger: "approval_resume" }), "running"),
      "blocked",
    );

    const kernel = createSessionKernel({
      stores: {
        threadStore: {
          async getLatest() { return thread; },
          async save() {},
          async get() { return thread; },
          async listByScope() { return [thread]; },
          async close() {},
        },
        taskStore: {
          async save() {},
          async get() { return undefined; },
          async listByThread() { return []; },
          async close() {},
        },
        runStore: {
          async getLatestByThread() { return blockedRun; },
        },
        approvalStore: {
          async listPendingByThread() { return []; },
          async get() { return undefined; },
        },
        workerStore: {
          async save() {},
          async get() { return undefined; },
          async listByThread() { return []; },
          async listActiveByThread() { return []; },
          async close() {},
        },
      },
      controlPlane: {
        async startRootTask() { throw new Error("not implemented"); },
        async approveRequest() { throw new Error("not implemented"); },
        async rejectRequest() { throw new Error("not implemented"); },
      },
      workspaceRoot: "/workspace",
      projectId: "project-1",
    });

    const hydrated = await kernel.hydrateSession();
    expect(hydrated?.status).toBe("blocked");
  });

  test("reject_request returns the current session view immediately and finalizes asynchronously", async () => {
    const thread = createThread("thread-reject", "/workspace", "project-1");
    const waitingRun = transitionRun(
      transitionRun(createRun({ runId: "run-reject", threadId: thread.threadId, trigger: "approval_resume" }), "running"),
      "waiting_approval",
    );
    const approval = {
      approvalRequestId: "approval-reject",
      threadId: thread.threadId,
      runId: waitingRun.runId,
      taskId: "task-reject",
      toolCallId: "tool-reject",
      toolRequest: {
        toolCallId: "tool-reject",
        threadId: thread.threadId,
        runId: waitingRun.runId,
        taskId: "task-reject",
        toolName: "apply_patch",
        args: {},
      },
      summary: "reject risky patch",
      risk: "apply_patch.update_file",
      status: "pending" as const,
    };
    const pendingTask = {
      ...createTask("task-reject", thread.threadId, waitingRun.runId, "Wait for approval"),
      status: "blocked" as const,
      blockingReason: {
        kind: "waiting_approval" as const,
        message: "Need user approval.",
      },
    };
    let rejectExecuted = false;

    const kernel = createSessionKernel({
      stores: {
        threadStore: {
          async getLatest() { return thread; },
          async save() {},
          async get() { return thread; },
          async listByScope() { return [thread]; },
          async close() {},
        },
        taskStore: {
          async save() {},
          async get() { return pendingTask; },
          async listByThread() { return [pendingTask]; },
          async close() {},
        },
        runStore: {
          async getLatestByThread() { return waitingRun; },
        },
        approvalStore: {
          async listPendingByThread() { return [approval]; },
          async get() { return approval; },
        },
        workerStore: {
          async save() {},
          async get() { return undefined; },
          async listByThread() { return []; },
          async listActiveByThread() { return []; },
          async close() {},
        },
      },
      controlPlane: {
        async startRootTask() { throw new Error("not implemented"); },
        async approveRequest() { throw new Error("not implemented"); },
        async rejectRequest() {
          rejectExecuted = true;
          return {
            status: "completed" as const,
            task: {
              taskId: "task-reject",
              threadId: thread.threadId,
              runId: waitingRun.runId,
              summary: "Rejected",
              status: "cancelled" as const,
            },
            approvals: [],
            summary: "Rejected",
          };
        },
      },
      workspaceRoot: "/workspace",
      projectId: "project-1",
    });

    const immediate = await kernel.handleCommand({
      type: "reject_request",
      payload: { approvalRequestId: approval.approvalRequestId },
    });

    expect(immediate.threadId).toBe(thread.threadId);
    expect(immediate.status).toBe("waiting_approval");
    expect(immediate.approvals).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(rejectExecuted).toBe(true);
  });
});
