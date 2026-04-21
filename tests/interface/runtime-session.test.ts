import { describe, expect, test } from "bun:test";
import { deriveRuntimeSession, formatThreadListSummary } from "../../src/surfaces/tui/runtime/runtime-session";

describe("Runtime session contract", () => {
  test("derives a stable blocked session view from snapshot data", () => {
    const session = deriveRuntimeSession({
      protocolVersion: "1.0.0",
      workspaceRoot: "/tmp/workspace",
      projectId: "project-1",
      lastEventSeq: 12,
      activeThreadId: "thread-1",
      activeRunId: "run-1",
      threadMode: "plan",
      narrativeSummary: "Completed repo scan and narrowed work to runtime recovery.",
      pauseSummary: "Manual recovery required from snapshot.",
      blockingReason: {
        kind: "human_recovery",
        message: "Manual recovery required from snapshot.",
      },
      threads: [
        {
          threadId: "thread-1",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          revision: 2,
          status: "active",
          threadMode: "plan",
          activeRunId: "run-1",
          activeRunStatus: "blocked",
        },
      ],
      runs: [
        {
          runId: "run-1",
          threadId: "thread-1",
          status: "blocked",
          trigger: "approval_resume",
          startedAt: "2026-04-06T00:00:00.000Z",
          blockingReason: {
            kind: "human_recovery",
            message: "Manual recovery required from snapshot.",
          },
        },
      ],
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
      answers: [
        {
          answerId: "answer-1",
          threadId: "thread-1",
          content: "Completed repo scan and narrowed work to runtime recovery.",
        },
      ],
      messages: [
        {
          messageId: "message-1",
          threadId: "thread-1",
          role: "user",
          content: "Recover the runtime snapshot path.",
        },
        {
          messageId: "message-2",
          threadId: "thread-1",
          role: "assistant",
          content: "Completed repo scan and narrowed work to runtime recovery.",
        },
      ],
      agentRuns: [
        {
          agentRunId: "agent-run-1",
          threadId: "thread-1",
          taskId: "task-1",
          roleKind: "legacy_internal",
          roleId: "planner",
          status: "running",
          spawnReason: "initial planning",
          goalSummary: "initial planning",
          visibilityPolicy: "hidden",
          startedAt: "2026-04-06T00:00:00.000Z",
          resumeToken: "resume-1",
        },
      ],
    });

    expect(session).toEqual({
      status: "completed",
      stage: "idle",
      primaryAgent: "build",
      threadMode: "plan",
      threadId: "thread-1",
      finalResponse: "Completed repo scan and narrowed work to runtime recovery.",
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
      answers: [
        {
          answerId: "answer-1",
          threadId: "thread-1",
          content: "Completed repo scan and narrowed work to runtime recovery.",
        },
      ],
      messages: [
        {
          messageId: "message-1",
          threadId: "thread-1",
          role: "user",
          content: "Recover the runtime snapshot path.",
        },
        {
          messageId: "message-2",
          threadId: "thread-1",
          role: "assistant",
          content: "Completed repo scan and narrowed work to runtime recovery.",
        },
      ],
      agentRuns: [
        {
          agentRunId: "agent-run-1",
          threadId: "thread-1",
          taskId: "task-1",
          roleKind: "legacy_internal",
          roleId: "planner",
          status: "running",
          spawnReason: "initial planning",
          goalSummary: "initial planning",
          visibilityPolicy: "hidden",
          startedAt: "2026-04-06T00:00:00.000Z",
          resumeToken: "resume-1",
        },
      ],
      workspaceRoot: "/tmp/workspace",
      projectId: "project-1",
      recommendationReason: undefined,
      planDecision: undefined,
      narrativeSummary: "Completed repo scan and narrowed work to runtime recovery.",
      threads: [
        {
          threadId: "thread-1",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          revision: 2,
          status: "active",
          threadMode: "plan",
          activeRunId: "run-1",
          activeRunStatus: "blocked",
        },
      ],
    });
  });

  test("prefers the active run lifecycle over thread status when deriving session status", () => {
    const session = deriveRuntimeSession({
      protocolVersion: "1.0.0",
      workspaceRoot: "/tmp/workspace",
      projectId: "project-1",
      lastEventSeq: 2,
      activeThreadId: "thread-2",
      activeRunId: "run-2",
      threadMode: "normal",
      threads: [
        {
          threadId: "thread-2",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          revision: 1,
          status: "active",
          threadMode: "normal",
          activeRunId: "run-2",
          activeRunStatus: "waiting_approval",
        },
      ],
      runs: [
        {
          runId: "run-2",
          threadId: "thread-2",
          status: "waiting_approval",
          trigger: "user_input",
          startedAt: "2026-04-06T00:00:00.000Z",
          blockingReason: {
            kind: "waiting_approval",
            message: "Need approval",
          },
        },
      ],
      tasks: [],
      pendingApprovals: [],
      answers: [],
      messages: [],
      agentRuns: [],
    });

    expect(session.status).toBe("waiting_approval");
    expect(session.stage).toBe("awaiting_confirmation");
    expect(session.primaryAgent).toBe("build");
    expect(session.threadMode).toBe("normal");
    expect(session.pauseSummary).toBeUndefined();
  });

  test("ignores stale blocking reasons while the active run is running", () => {
    const session = deriveRuntimeSession({
      protocolVersion: "1.0.0",
      workspaceRoot: "/tmp/workspace",
      projectId: "project-1",
      lastEventSeq: 3,
      activeThreadId: "thread-running",
      activeRunId: "run-running",
      threadMode: "plan",
      blockingReason: {
        kind: "plan_decision",
        message: "旧方案选择问题",
      },
      threads: [
        {
          threadId: "thread-running",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          revision: 3,
          status: "active",
          threadMode: "plan",
          activeRunId: "run-running",
          activeRunStatus: "running",
          blockingReasonKind: "plan_decision",
        },
      ],
      runs: [
        {
          runId: "run-running",
          threadId: "thread-running",
          status: "running",
          trigger: "user_input",
          startedAt: "2026-04-06T00:00:00.000Z",
          blockingReason: {
            kind: "plan_decision",
            message: "旧方案选择问题",
          },
        },
      ],
      tasks: [
        {
          taskId: "task-running",
          threadId: "thread-running",
          runId: "run-running",
          status: "running",
          summary: "继续执行登录页方案",
        },
      ],
      pendingApprovals: [],
      answers: [],
      messages: [],
      agentRuns: [],
    });

    expect(session.status).toBe("completed");
    expect(session.stage).toBe("idle");
    expect(session.pauseSummary).toBeUndefined();
  });

  test("formats thread list summaries from stable session views", () => {
    expect(
      formatThreadListSummary({
        threadId: "thread-2",
        threads: [
          {
            threadId: "thread-2",
            workspaceRoot: "/tmp/workspace",
            projectId: "project-1",
            revision: 4,
            status: "active",
            threadMode: "plan",
            activeRunStatus: "waiting_approval",
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
      }),
    ).toBe(
      "thread-2 (active) [waiting_approval] mode:plan approval:1 Current active thread summary.\nthread-1 [completed] mode:normal human_recovery Completed repo scan and isolated runtime recovery work.",
    );
  });
});
