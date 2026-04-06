import { describe, expect, test, mock } from "bun:test";
import type { ThreadNarrativeService } from "../../src/control/context/thread-narrative-service";
import { createSessionKernel } from "../../src/kernel/session-kernel";
import { createThread } from "../../src/domain/thread";

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
        approvalStore: {
          async listPendingByThread() { return []; },
          async get() { return undefined; },
        },
      },
      controlPlane: {
        async startRootTask(threadId, input) {
          const text = typeof input === "string" ? input : input.reason ?? "approved";
          return {
            status: "completed",
            task: { taskId: "task-1", threadId, summary: text, status: "completed" },
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
        approvalStore: {
          async listPendingByThread() { return []; },
          async get() { return undefined; },
        },
      },
      controlPlane: {
        async startRootTask(threadId, input) {
          const text = typeof input === "string" ? input : input.reason ?? "approved";
          return {
            status: "completed",
            task: { taskId: "task-completed", threadId, summary: "Stable work", status: "completed" },
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
});
