import { describe, expect, test } from "bun:test";
import { createRemoteKernel } from "../../src/surfaces/tui/runtime/remote-kernel";
import type { RuntimeClient } from "../../src/surfaces/tui/runtime/runtime-client";
import type { TuiKernelEvent } from "../../src/surfaces/tui/hooks/use-kernel";

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
          activeRunId: undefined,
          threadMode: "normal",
          recommendationReason: undefined,
          blockingReason: {
            kind: "human_recovery",
            message: "Manual recovery required from snapshot.",
          },
          threads: [],
          runs: [],
          tasks: [
            {
              taskId: "task-1",
              threadId: "thread-1",
              runId: "run-1",
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
      stage: "blocked",
      primaryAgent: "build",
      threadMode: "normal",
      threadId: "thread-1",
      finalResponse: undefined,
      executionSummary: undefined,
      verificationSummary: undefined,
      pauseSummary: "Manual recovery required from snapshot.",
      tasks: [
            {
              taskId: "task-1",
              threadId: "thread-1",
              runId: "run-1",
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
      messages: [],
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
          activeRunId: undefined,
          threadMode: "plan",
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
              threadMode: "plan",
              narrativeSummary: "Current active thread summary.",
              pendingApprovalCount: 1,
            },
            {
              threadId: "thread-1",
              workspaceRoot: "/tmp/workspace",
              projectId: "project-1",
              revision: 2,
              status: "idle",
              threadMode: "normal",
              activeRunStatus: "completed",
              narrativeSummary: "Completed repo scan and isolated runtime recovery work.",
              blockingReasonKind: "human_recovery",
            },
          ],
          runs: [],
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
    expect((result as { finalResponse: string }).finalResponse).toContain("thread-2 (active) [active] mode:plan approval:1 Current active thread summary.");
    expect((result as { finalResponse: string }).finalResponse).toContain(
      "thread-1 [completed] mode:normal human_recovery Completed repo scan and isolated runtime recovery work.",
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
          activeRunId: undefined,
          threadMode: "normal",
          recommendationReason: undefined,
          blockingReason: {
            kind: "human_recovery",
            message: "Manual recovery required from snapshot.",
          },
          threads: [],
          runs: [],
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

  test("hydrates first and subscribes after the snapshot cursor on initial connect", async () => {
    const subscribeCalls: Array<number | undefined> = [];
    const client: Pick<RuntimeClient, "getSnapshot" | "sendCommand" | "subscribeEvents"> = {
      async getSnapshot() {
        return {
          protocolVersion: "1.0.0",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          lastEventSeq: 12,
          activeThreadId: "thread-1",
          activeRunId: undefined,
          threadMode: "normal",
          recommendationReason: undefined,
          blockingReason: undefined,
          threads: [],
          runs: [],
          tasks: [],
          pendingApprovals: [],
          answers: [],
          workers: [],
        };
      },
      async sendCommand() {
        return undefined;
      },
      subscribeEvents(afterSeq?: number) {
        subscribeCalls.push(afterSeq);
        return {
          async *[Symbol.asyncIterator]() {
            await new Promise(() => undefined);
          },
        };
      },
    };

    const kernel = createRemoteKernel(client);
    const unsubscribe = kernel.events.subscribe(() => undefined);

    await new Promise((resolve) => setTimeout(resolve, 20));
    unsubscribe();

    expect(subscribeCalls).toContain(12);
  });

  test("reconnects from the latest delivered sequence instead of replaying from zero", async () => {
    const subscribeCalls: Array<number | undefined> = [];
    let subscribeAttempt = 0;
    const client: Pick<RuntimeClient, "getSnapshot" | "sendCommand" | "subscribeEvents"> = {
      async getSnapshot() {
        return {
          protocolVersion: "1.0.0",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          lastEventSeq: subscribeAttempt === 0 ? 4 : 5,
          activeThreadId: "thread-1",
          activeRunId: undefined,
          threadMode: "normal",
          recommendationReason: undefined,
          blockingReason: undefined,
          threads: [],
          runs: [],
          tasks: [],
          pendingApprovals: [],
          answers: [],
          workers: [],
        };
      },
      async sendCommand() {
        return undefined;
      },
      subscribeEvents(afterSeq?: number) {
        subscribeCalls.push(afterSeq);
        const currentAttempt = subscribeAttempt++;
        return {
          async *[Symbol.asyncIterator]() {
            if (currentAttempt === 0) {
              yield {
                protocolVersion: "1.0.0" as const,
                seq: 5,
                timestamp: new Date().toISOString(),
                traceId: "trace-1",
                event: {
                  type: "model.status" as const,
                  payload: { status: "thinking" as const },
                },
              };
              throw new Error("simulated disconnect");
            }

            await new Promise(() => undefined);
          },
        };
      },
    };

    const kernel = createRemoteKernel(client);
    const unsubscribe = kernel.events.subscribe(() => undefined);

    await new Promise((resolve) => setTimeout(resolve, 2300));
    unsubscribe();

    expect(subscribeCalls[0]).toBe(4);
    expect(subscribeCalls[1]).toBe(5);
  });

  test("exposes an interruptCurrentThread helper that forwards the runtime interrupt command", async () => {
    const sentCommands: unknown[] = [];
    const client: Pick<RuntimeClient, "getSnapshot" | "sendCommand" | "subscribeEvents"> = {
      async getSnapshot() {
        return {
          protocolVersion: "1.0.0",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          lastEventSeq: 12,
          activeThreadId: "thread-1",
          activeRunId: undefined,
          threadMode: "normal",
          recommendationReason: undefined,
          blockingReason: undefined,
          threads: [],
          runs: [],
          tasks: [],
          pendingApprovals: [],
          answers: [],
          workers: [],
        };
      },
      async sendCommand(command) {
        sentCommands.push(command);
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

    await kernel.interruptCurrentThread?.();

    expect(sentCommands).toEqual([{ kind: "interrupt", threadId: "thread-1" }]);
  });

  test("forwards planning input through a thread mode toggle plus normal task submission", async () => {
    const sentCommands: unknown[] = [];
    const client: Pick<RuntimeClient, "getSnapshot" | "sendCommand" | "subscribeEvents"> = {
      async getSnapshot() {
        return {
          protocolVersion: "1.0.0",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          lastEventSeq: 12,
          activeThreadId: "thread-1",
          activeRunId: undefined,
          threadMode: "normal",
          recommendationReason: undefined,
          blockingReason: undefined,
          threads: [],
          runs: [],
          tasks: [],
          pendingApprovals: [],
          answers: [],
          workers: [],
        };
      },
      async sendCommand(command) {
        sentCommands.push(command);
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

    await kernel.handleCommand({
      type: "plan_input",
      payload: { text: "design the rollout" },
    });

    expect(sentCommands).toEqual([
      {
        kind: "set_thread_mode",
        threadId: "thread-1",
        mode: "plan",
        trigger: "slash_command",
      },
      {
        kind: "add_task",
        content: "design the rollout",
      },
    ]);
  });

  test("clears plan mode before forwarding ordinary submit input", async () => {
    const sentCommands: unknown[] = [];
    const client: Pick<RuntimeClient, "getSnapshot" | "sendCommand" | "subscribeEvents"> = {
      async getSnapshot() {
        return {
          protocolVersion: "1.0.0",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          lastEventSeq: 12,
          activeThreadId: "thread-1",
          activeRunId: undefined,
          threadMode: "plan",
          recommendationReason: undefined,
          blockingReason: undefined,
          threads: [],
          runs: [],
          tasks: [],
          pendingApprovals: [],
          answers: [],
          workers: [],
        };
      },
      async sendCommand(command) {
        sentCommands.push(command);
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

    await kernel.handleCommand({
      type: "submit_input",
      payload: { text: "ship it" },
    });

    expect(sentCommands).toEqual([
      {
        kind: "clear_thread_mode",
        threadId: "thread-1",
        trigger: "plain_input",
      },
      {
        kind: "add_task",
        content: "ship it",
      },
    ]);
  });

  test("forwards plan decision selections as durable continuation commands", async () => {
    const sentCommands: unknown[] = [];
    const client: Pick<RuntimeClient, "getSnapshot" | "sendCommand" | "subscribeEvents"> = {
      async getSnapshot() {
        return {
          protocolVersion: "1.0.0",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          lastEventSeq: 12,
          activeThreadId: "thread-1",
          activeRunId: "run-1",
          threadMode: "plan",
          recommendationReason: undefined,
          blockingReason: undefined,
          threads: [],
          runs: [],
          tasks: [],
          pendingApprovals: [],
          answers: [],
          workers: [],
        };
      },
      async sendCommand(command) {
        sentCommands.push(command);
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

    await kernel.handleCommand({
      type: "resolve_plan_decision",
      payload: {
        optionId: "brand",
        optionLabel: "品牌化登录页",
        input: "我要开发一个登录界面\n\n已选择方案：品牌化登录页",
      },
    });

    expect(sentCommands).toEqual([
      {
        kind: "resolve_plan_decision",
        threadId: "thread-1",
        runId: "run-1",
        optionId: "brand",
        optionLabel: "品牌化登录页",
        input: "我要开发一个登录界面\n\n已选择方案：品牌化登录页",
      },
    ]);
  });
});
