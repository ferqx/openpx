import { describe, expect, test } from "bun:test";
import { createRemoteKernel } from "../../src/interface/runtime/remote-kernel";

describe("Remote Kernel", () => {
  test("derives blocked composer state from snapshot hydration", async () => {
    const kernel = createRemoteKernel({
      async getSnapshot() {
        return {
          protocolVersion: "1.0.0",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          lastEventSeq: 12,
          activeThreadId: "thread-1",
          recommendationReason: undefined,
          blockingReason: {
            kind: "human_recovery",
            message: "Manual recovery required from snapshot.",
          },
          threads: [],
          tasks: [
            {
              taskId: "task-1",
              status: "blocked",
              summary: "Recover risky patch",
              blockingReason: {
                kind: "human_recovery",
                message: "Manual recovery required from snapshot.",
              },
            },
          ],
          pendingApprovals: [],
          answers: [],
        };
      },
      async sendCommand() {
        return undefined;
      },
      subscribeEvents() {
        return {
          async *[Symbol.asyncIterator]() {
            await new Promise(() => undefined);
          },
        };
      },
    } as any);

    const hydrated = await kernel.hydrateSession?.();

    expect(hydrated).toEqual({
      status: "blocked",
      threadId: "thread-1",
      summary: "Manual recovery required from snapshot.",
      tasks: [
        {
          taskId: "task-1",
          status: "blocked",
          summary: "Recover risky patch",
          blockingReason: {
            kind: "human_recovery",
            message: "Manual recovery required from snapshot.",
          },
        },
      ],
      approvals: [],
      workspaceRoot: "/tmp/workspace",
      projectId: "project-1",
      blockingReason: {
        kind: "human_recovery",
        message: "Manual recovery required from snapshot.",
      },
      recommendationReason: undefined,
      narrativeSummary: undefined,
      threads: [],
    });
  });
});
