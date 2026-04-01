import { describe, expect, test } from "bun:test";
import { createSessionKernel } from "../../src/kernel/session-kernel";

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
          async get(threadId) {
            return threadId === savedThreadId ? { threadId, status: "active" } : undefined;
          },
          async close() {},
        },
      },
      controlPlane: {
        async startRootTask(threadId, text) {
          startedThreadId = threadId;
          startedText = text;
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
