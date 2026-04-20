import { describe, expect, test } from "bun:test";
import { agentRunViewSchema, toAgentRunView } from "../../src/harness/protocol/views/agent-run-view";

describe("AgentRunView protocol adapter", () => {
  test("adapts a runtime record to an AgentRun view", () => {
    const agentRun = toAgentRunView({
      agentRunId: "agent-run-verify-1",
      threadId: "thread-1",
      taskId: "task-1",
      role: "verifier",
      status: "running",
      spawnReason: "run verification suite",
      startedAt: "2026-04-20T00:00:00.000Z",
      resumeToken: "resume-verify",
    });

    expect(agentRun).toEqual({
      agentRunId: "agent-run-verify-1",
      threadId: "thread-1",
      taskId: "task-1",
      roleKind: "subagent",
      roleId: "verify",
      status: "running",
      spawnReason: "run verification suite",
      goalSummary: "run verification suite",
      visibilityPolicy: "visible_when_instance",
      startedAt: "2026-04-20T00:00:00.000Z",
      resumeToken: "resume-verify",
    });
    expect(agentRunViewSchema.safeParse(agentRun).success).toBe(true);
  });
});
