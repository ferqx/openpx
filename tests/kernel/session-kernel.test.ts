import { describe, expect, test } from "bun:test";
import { createSessionKernel } from "../../src/kernel/session-kernel";
import { threadId as sharedThreadId } from "../../src/shared/ids";
import type { Thread } from "../../src/domain/thread";

describe("SessionKernel", () => {
  test("creates a thread, emits a thread.started event, and starts the root task", async () => {
    let savedThreadId = "";
    let startedThreadId = "";
    let startedText = "";
    const kernel = createSessionKernel({
      stores: {
        threadStore: {
          async save(thread) {
            savedThreadId = thread.threadId;
          },
          async getLatest() {
            return undefined;
          },
          async get(threadId) {
            return threadId === savedThreadId
              ? {
                  threadId: sharedThreadId(threadId),
                  workspaceRoot: "",
                  projectId: "",
                  revision: 1,
                  status: "active",
                }
              : undefined;
          },
          async close() {},
        },
        taskStore: {
          async save() {},
          async get() {
            return undefined;
          },
          async listByThread() {
            return [];
          },
          async close() {},
        },
        approvalStore: {
          async listPendingByThread() {
            return [];
          },
        },
      },
      controlPlane: {
        async startRootTask(threadId, text) {
          startedThreadId = threadId;
          startedText = text;
          return {
            status: "completed" as const,
            task: {
              taskId: "task_1",
              threadId,
              summary: text,
              status: "completed" as const,
            },
            approvals: [],
            summary: text,
          };
        },
        async approveRequest() {
          throw new Error("not needed in this test");
        },
        async rejectRequest() {
          throw new Error("not needed in this test");
        },
      },
    });
    const events: string[] = [];
    kernel.events.subscribe((event) => events.push(event.type));

    await kernel.handleCommand({ type: "submit_input", payload: { text: "plan the repo" } });

    expect(events).toContain("thread.started");
    expect(startedThreadId).toBe(savedThreadId);
    expect(startedText).toBe("plan the repo");
  });
});
