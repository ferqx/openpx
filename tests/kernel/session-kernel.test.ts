import { describe, expect, test } from "bun:test";
import { createSessionKernel } from "../../src/kernel/session-kernel";

describe("SessionKernel", () => {
  test("creates a thread and emits a thread.started event", async () => {
    const kernel = createSessionKernel({
      stores: {
        threadStore: {
          async createThread() {
            return { threadId: "thread_1" };
          },
        },
      },
      controlPlane: {
        async startRootTask() {
          return;
        },
      },
    });
    const events: string[] = [];
    kernel.events.subscribe((event) => events.push(event.type));

    await kernel.handleCommand({ type: "submit_input", payload: { text: "plan the repo" } });

    expect(events).toContain("thread.started");
  });
});
