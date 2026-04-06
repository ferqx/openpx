import { describe, expect, test } from "bun:test";
import { createRemoteKernel } from "../../src/interface/runtime/remote-kernel";
import type { RuntimeClient } from "../../src/interface/runtime/runtime-client";
import type { TuiKernelEvent } from "../../src/interface/tui/hooks/use-kernel";

describe("Remote Kernel", () => {
  test("derives blocked composer state from snapshot hydration", async () => {
    const client: Pick<RuntimeClient, "getSnapshot" | "sendCommand" | "subscribeEvents"> = {
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
              threadId: "thread-1",
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
          workers: [
            {
              workerId: "worker-1",
              threadId: "thread-1",
              taskId: "task-1",
              role: "planner",
              status: "paused",
              spawnReason: "runtime recovery",
              startedAt: "2026-04-06T00:00:00.000Z",
              resumeToken: "resume-1",
            },
          ],
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
    };
    const kernel = createRemoteKernel(client);

    const hydrated = await kernel.hydrateSession?.();

    expect(hydrated).toEqual({
      status: "blocked",
      threadId: "thread-1",
      summary: "Manual recovery required from snapshot.",
      tasks: [
        {
          taskId: "task-1",
          threadId: "thread-1",
          status: "blocked",
          summary: "Recover risky patch",
          blockingReason: {
            kind: "human_recovery",
            message: "Manual recovery required from snapshot.",
          },
        },
      ],
      approvals: [],
      answers: [],
      workers: [
        {
          workerId: "worker-1",
          threadId: "thread-1",
          taskId: "task-1",
          role: "planner",
          status: "paused",
          spawnReason: "runtime recovery",
          startedAt: "2026-04-06T00:00:00.000Z",
          resumeToken: "resume-1",
        },
      ],
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

  test("formats thread list output with durable narrative summaries", async () => {
    const client: Pick<RuntimeClient, "getSnapshot" | "sendCommand" | "subscribeEvents"> = {
      async getSnapshot() {
        return {
          protocolVersion: "1.0.0",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          lastEventSeq: 3,
          activeThreadId: "thread-2",
          recommendationReason: undefined,
          narrativeSummary: "Current active thread summary.",
          blockingReason: undefined,
          threads: [
            {
              threadId: "thread-2",
              workspaceRoot: "/tmp/workspace",
              projectId: "project-1",
              revision: 4,
              status: "active",
              narrativeSummary: "Current active thread summary.",
              pendingApprovalCount: 1,
            },
            {
              threadId: "thread-1",
              workspaceRoot: "/tmp/workspace",
              projectId: "project-1",
              revision: 2,
              status: "completed",
              narrativeSummary: "Completed repo scan and isolated runtime recovery work.",
              blockingReasonKind: "human_recovery",
            },
          ],
          tasks: [],
          pendingApprovals: [],
          answers: [],
          workers: [],
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
    };
    const kernel = createRemoteKernel(client);

    const result = await kernel.handleCommand({ type: "thread_list" });

    expect(result).toMatchObject({
      status: "completed",
      threadId: "thread-2",
    });
    expect((result as { summary: string }).summary).toContain("thread-2 (active) [active] approval:1 Current active thread summary.");
    expect((result as { summary: string }).summary).toContain(
      "thread-1 [completed] human_recovery Completed repo scan and isolated runtime recovery work.",
    );
  });

  test("emits a dedicated session update event for hydration instead of reusing thread.view_updated", async () => {
    const client: Pick<RuntimeClient, "getSnapshot" | "sendCommand" | "subscribeEvents"> = {
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
          tasks: [],
          pendingApprovals: [],
          answers: [],
          workers: [],
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
    };

    const kernel = createRemoteKernel(client);
    const received: TuiKernelEvent[] = [];
    const unsubscribe = kernel.events.subscribe((event) => {
      received.push(event);
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    unsubscribe();

    expect(received.some((event) => event.type === "session.updated")).toBe(true);
    expect(
      received.some((event) => event.type === "thread.view_updated" && "_hydration" in event.payload),
    ).toBe(false);
  });
});
