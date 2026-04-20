import { describe, expect, test } from "bun:test";
import { createAgentRunManager } from "../../src/control/agent-runs/agent-run-manager";
import type { AgentRunRecord } from "../../src/domain/agent-run";

describe("AgentRunManager", () => {
  test("spawns an executor agent run for a task", async () => {
    const starts: Array<{
      agentRunId: string;
      role: string;
      taskId: string;
      threadId: string;
      spawnReason: string;
      resumeToken?: string;
    }> = [];
    const storedAgentRuns = new Map<string, AgentRunRecord>();
    const manager = createAgentRunManager({
      runtimeFactory(input) {
        return {
          async start() {
            starts.push({ ...input, resumeToken: "resume-started" });
            return {
              status: "running",
              startedAt: "2026-04-06T00:00:00.000Z",
              resumeToken: "resume-started",
            };
          },
          async inspect() {
            return {
              status: "running",
              startedAt: "2026-04-06T00:00:00.000Z",
              resumeToken: "resume-started",
            };
          },
          async resume() {
            return {
              status: "running",
              resumeToken: "resume-started",
            };
          },
          async cancel() {
            return {
              status: "cancelled",
              endedAt: "2026-04-06T00:01:00.000Z",
            };
          },
          async join() {
            return {
              status: "completed",
              endedAt: "2026-04-06T00:02:00.000Z",
            };
          },
        };
      },
      agentRunStore: {
        async save(agentRun) {
          storedAgentRuns.set(agentRun.agentRunId, agentRun);
        },
        async get(agentRunId) {
          return storedAgentRuns.get(agentRunId);
        },
        async listByThread(threadId) {
          return [...storedAgentRuns.values()].filter((agentRun) => agentRun.threadId === threadId);
        },
        async listActiveByThread(threadId) {
          return [...storedAgentRuns.values()].filter(
            (agentRun) => agentRun.threadId === threadId && !["completed", "failed", "cancelled"].includes(agentRun.status),
          );
        },
        async close() {},
      },
    });

    const agentRun = await manager.spawn({
      role: "executor",
      taskId: "task_1",
      threadId: "thread_1",
      spawnReason: "execute patch",
    });

    expect(agentRun.role).toBe("executor");
    expect(agentRun.status).toBe("running");
    expect(agentRun.agentRunId).toStartWith("agent_run_");
    expect(agentRun.taskId).toBe("task_1");
    expect(agentRun.threadId).toBe("thread_1");
    expect(agentRun.spawnReason).toBe("execute patch");
    expect(agentRun.startedAt).toBe("2026-04-06T00:00:00.000Z");
    expect(agentRun.resumeToken).toBe("resume-started");
    expect(starts).toEqual([
      {
        agentRunId: agentRun.agentRunId,
        role: "executor",
        taskId: "task_1",
        threadId: "thread_1",
        spawnReason: "execute patch",
        resumeToken: "resume-started",
      },
    ]);
  });

  test("creates distinct agent run IDs when the timestamp collides", async () => {
    const originalDateNow = Date.now;
    Date.now = () => 1234567890;

    const starts: Array<{ agentRunId: string }> = [];
    const storedAgentRuns = new Map<string, AgentRunRecord>();
    const manager = createAgentRunManager({
      runtimeFactory(input) {
        return {
          async start() {
            starts.push({
              agentRunId: input.agentRunId,
            });
            return {
              status: "running",
              startedAt: "2026-04-06T00:00:00.000Z",
            };
          },
          async inspect() {
            return {
              status: "running",
              startedAt: "2026-04-06T00:00:00.000Z",
            };
          },
          async resume() {
            return {
              status: "running",
            };
          },
          async cancel() {
            return {
              status: "cancelled",
              endedAt: "2026-04-06T00:01:00.000Z",
            };
          },
          async join() {
            return {
              status: "completed",
              endedAt: "2026-04-06T00:02:00.000Z",
            };
          },
        };
      },
      agentRunStore: {
        async save(agentRun) {
          storedAgentRuns.set(agentRun.agentRunId, agentRun);
        },
        async get(agentRunId) {
          return storedAgentRuns.get(agentRunId);
        },
        async listByThread(threadId) {
          return [...storedAgentRuns.values()].filter((agentRun) => agentRun.threadId === threadId);
        },
        async listActiveByThread(threadId) {
          return [...storedAgentRuns.values()].filter(
            (agentRun) => agentRun.threadId === threadId && !["completed", "failed", "cancelled"].includes(agentRun.status),
          );
        },
        async close() {},
      },
    });

    try {
      const first = await manager.spawn({
        role: "executor",
        taskId: "task_1",
        threadId: "thread_1",
        spawnReason: "execute patch",
      });
      const second = await manager.spawn({
        role: "executor",
        taskId: "task_1",
        threadId: "thread_1",
        spawnReason: "execute patch",
      });

      expect(new Set([first.agentRunId, second.agentRunId]).size).toBe(2);
      expect(new Set(starts.map((start) => start.agentRunId)).size).toBe(2);
    } finally {
      Date.now = originalDateNow;
    }
  });

  test("inspects, resumes, cancels, and joins spawned agentRuns", async () => {
    const calls: string[] = [];
    const storedAgentRuns = new Map<string, AgentRunRecord>();
    const manager = createAgentRunManager({
      runtimeFactory() {
        return {
          async start() {
            calls.push("start");
            return {
              status: "running",
              startedAt: "2026-04-06T00:00:00.000Z",
              resumeToken: "resume-active",
            };
          },
          async inspect() {
            calls.push("inspect");
            return {
              status: "paused",
              startedAt: "2026-04-06T00:00:00.000Z",
              resumeToken: "resume-paused",
            };
          },
          async resume() {
            calls.push("resume");
            return {
              status: "running",
              resumeToken: "resume-resumed",
            };
          },
          async cancel() {
            calls.push("cancel");
            return {
              status: "cancelled",
              endedAt: "2026-04-06T00:01:00.000Z",
            };
          },
          async join() {
            calls.push("join");
            return {
              status: "completed",
              endedAt: "2026-04-06T00:02:00.000Z",
            };
          },
        };
      },
      agentRunStore: {
        async save(agentRun) {
          storedAgentRuns.set(agentRun.agentRunId, agentRun);
        },
        async get(agentRunId) {
          return storedAgentRuns.get(agentRunId);
        },
        async listByThread(threadId) {
          return [...storedAgentRuns.values()].filter((agentRun) => agentRun.threadId === threadId);
        },
        async listActiveByThread(threadId) {
          return [...storedAgentRuns.values()].filter(
            (agentRun) => agentRun.threadId === threadId && !["completed", "failed", "cancelled"].includes(agentRun.status),
          );
        },
        async close() {},
      },
    });

    const spawned = await manager.spawn({
      role: "executor",
      taskId: "task_2",
      threadId: "thread_2",
      spawnReason: "execute patch",
    });
    const inspected = await manager.inspect(spawned.agentRunId);
    const resumed = await manager.resume(spawned.agentRunId);
    const joined = await manager.join(spawned.agentRunId);
    const spawnedToCancel = await manager.spawn({
      role: "executor",
      taskId: "task_3",
      threadId: "thread_2",
      spawnReason: "execute patch",
    });
    const cancelled = await manager.cancel(spawnedToCancel.agentRunId);

    expect(inspected?.status).toBe("paused");
    expect(inspected?.resumeToken).toBe("resume-paused");
    expect(resumed.status).toBe("running");
    expect(resumed.resumeToken).toBe("resume-resumed");
    expect(joined.status).toBe("completed");
    expect(joined.endedAt).toBe("2026-04-06T00:02:00.000Z");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.endedAt).toBe("2026-04-06T00:01:00.000Z");
    expect(calls).toEqual(["start", "inspect", "resume", "join", "start", "cancel"]);
  });
});
