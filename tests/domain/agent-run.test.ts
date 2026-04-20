import { describe, expect, test } from "bun:test";
import { createAgentRunRecord } from "../../src/domain/agent-run";
import { toAgentRun } from "../../src/control/agents/agent-run-adapter";

describe("AgentRun domain adapter", () => {
  test("maps an executor runtime record to the Build primary AgentRun", () => {
    const agentRunRecord = createAgentRunRecord({
      agentRunId: "agent-run-executor-1",
      threadId: "thread-1",
      taskId: "task-1",
      role: "executor",
      spawnReason: "execute implementation plan",
      resumeToken: "resume-executor",
    });

    const agentRun = toAgentRun(agentRunRecord);

    expect(agentRun).toMatchObject({
      agentRunId: "agent-run-executor-1",
      threadId: "thread-1",
      taskId: "task-1",
      roleKind: "primary",
      roleId: "build",
      status: "created",
      spawnReason: "execute implementation plan",
      goalSummary: "execute implementation plan",
      visibilityPolicy: "visible_when_instance",
      resumeToken: "resume-executor",
    });
  });

  test("maps verifier and memory runtime records to subagent and system AgentRuns", () => {
    const verifierRun = toAgentRun(createAgentRunRecord({
      agentRunId: "agent-run-verifier-1",
      threadId: "thread-1",
      taskId: "task-verify",
      role: "verifier",
      spawnReason: "run verification",
    }));
    const memoryRun = toAgentRun(createAgentRunRecord({
      agentRunId: "agent-run-memory-1",
      threadId: "thread-1",
      taskId: "task-memory",
      role: "memory_maintainer",
      spawnReason: "compact memory",
    }));

    expect(verifierRun.roleKind).toBe("subagent");
    expect(verifierRun.roleId).toBe("verify");
    expect(verifierRun.visibilityPolicy).toBe("visible_when_instance");
    expect(memoryRun.roleKind).toBe("system");
    expect(memoryRun.roleId).toBe("memory_maintainer");
    expect(memoryRun.visibilityPolicy).toBe("hidden");
  });

  test("keeps planner runtime records in the legacy internal lane", () => {
    const plannerRun = toAgentRun(createAgentRunRecord({
      agentRunId: "agent-run-planner-1",
      threadId: "thread-1",
      taskId: "task-plan",
      role: "planner",
      spawnReason: "legacy planning step",
    }));

    expect(plannerRun.roleKind).toBe("legacy_internal");
    expect(plannerRun.roleId).toBe("planner");
    expect(plannerRun.visibilityPolicy).toBe("hidden");
  });
});
