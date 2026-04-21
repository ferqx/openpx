import { describe, expect, test } from "bun:test";
import { createAgentRunRecord, transitionAgentRun } from "../../src/domain/agent-run";

describe("AgentRun lifecycle", () => {
  test("allows pause, resume, complete, and cancel lifecycle transitions", () => {
    const agentRun = createAgentRunRecord({
      agentRunId: "w1",
      threadId: "t1",
      taskId: "task1",
      role: "planner",
      spawnReason: "test",
      resumeToken: "resume-1",
    });

    expect(agentRun.status).toBe("created");
    expect(agentRun.resumeToken).toBe("resume-1");

    const startingAgentRun = transitionAgentRun(agentRun, "starting", {
      startedAt: "2026-04-06T00:00:00.000Z",
    });
    const runningAgentRun = transitionAgentRun(startingAgentRun, "running", {
      resumeToken: "resume-running",
    });
    const pausedAgentRun = transitionAgentRun(runningAgentRun, "paused", {
      resumeToken: "resume-paused",
    });
    const resumedAgentRun = transitionAgentRun(pausedAgentRun, "running", {
      resumeToken: "resume-resumed",
    });
    const completedAgentRun = transitionAgentRun(resumedAgentRun, "completed", {
      endedAt: "2026-04-06T00:01:00.000Z",
      resumeToken: undefined,
    });
    const cancelledAgentRun = transitionAgentRun(resumedAgentRun, "cancelled", {
      endedAt: "2026-04-06T00:01:30.000Z",
      resumeToken: undefined,
    });

    expect(startingAgentRun.status).toBe("starting");
    expect(startingAgentRun.startedAt).toBe("2026-04-06T00:00:00.000Z");
    expect(runningAgentRun.status).toBe("running");
    expect(runningAgentRun.resumeToken).toBe("resume-running");
    expect(pausedAgentRun.status).toBe("paused");
    expect(pausedAgentRun.resumeToken).toBe("resume-paused");
    expect(resumedAgentRun.status).toBe("running");
    expect(resumedAgentRun.resumeToken).toBe("resume-resumed");
    expect(completedAgentRun.status).toBe("completed");
    expect(completedAgentRun.endedAt).toBe("2026-04-06T00:01:00.000Z");
    expect(completedAgentRun.resumeToken).toBeUndefined();
    expect(cancelledAgentRun.status).toBe("cancelled");
    expect(cancelledAgentRun.endedAt).toBe("2026-04-06T00:01:30.000Z");
  });

  test("rejects invalid lifecycle transitions", () => {
    const agentRun = createAgentRunRecord({
      agentRunId: "w2",
      threadId: "t1",
      taskId: "task2",
      role: "executor",
      spawnReason: "test",
    });

    expect(() => transitionAgentRun(agentRun, "completed")).toThrow(/invalid agent run transition/);
  });
});
