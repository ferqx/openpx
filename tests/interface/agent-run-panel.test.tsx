import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { AgentRunPanel } from "../../src/surfaces/tui/components/agent-run-panel";

describe("AgentRunPanel", () => {
  test("renders AgentRun role identity instead of legacy agent run role labels", () => {
    const { lastFrame } = render(
      <AgentRunPanel
        agentRuns={[
          {
            agentRunId: "agent-run-verify-1",
            threadId: "thread-1",
            taskId: "task-1",
            roleKind: "subagent",
            roleId: "verify",
            status: "running",
            spawnReason: "run verification suite",
            goalSummary: "run verification suite",
            visibilityPolicy: "visible_when_instance",
          },
        ]}
      />,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("agent run");
    expect(frame).toContain("subagent:verify [running]");
    expect(frame).not.toContain("verifier [running]");
  });

  test("renders primary agent run identity directly", () => {
    const { lastFrame } = render(
      <AgentRunPanel
        agentRuns={[
          {
            agentRunId: "agent-run-build-1",
            threadId: "thread-1",
            taskId: "task-1",
            roleKind: "primary",
            roleId: "build",
            status: "running",
            spawnReason: "execute patch",
            goalSummary: "execute patch",
            visibilityPolicy: "visible_when_instance",
          },
        ]}
      />,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("primary:build [running]");
  });
});
