import { describe, expect, test } from "bun:test";
import { deriveRuntimeSession, formatThreadListSummary } from "../../src/interface/runtime/runtime-session";

describe("Runtime session contract", () => {
  test("derives a stable blocked session view from snapshot data", () => {
    const session = deriveRuntimeSession({
      protocolVersion: "1.0.0",
      workspaceRoot: "/tmp/workspace",
      projectId: "project-1",
      lastEventSeq: 12,
      activeThreadId: "thread-1",
      narrativeSummary: "Completed repo scan and narrowed work to runtime recovery.",
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
          status: "blocked",
        },
      ],
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
      workers: [
        {
          workerId: "worker-1",
          threadId: "thread-1",
          taskId: "task-1",
          role: "planner",
          status: "running",
          spawnReason: "initial planning",
          startedAt: "2026-04-06T00:00:00.000Z",
          resumeToken: "resume-1",
        },
      ],
    });

    expect(session).toEqual({
      status: "blocked",
      stage: "blocked",
      threadId: "thread-1",
      summary: "Completed repo scan and narrowed work to runtime recovery.",
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
      workers: [
        {
          workerId: "worker-1",
          threadId: "thread-1",
          taskId: "task-1",
          role: "planner",
          status: "running",
          spawnReason: "initial planning",
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
      narrativeSummary: "Completed repo scan and narrowed work to runtime recovery.",
      threads: [
        {
          threadId: "thread-1",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          revision: 2,
          status: "blocked",
        },
      ],
    });
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
      }),
    ).toBe(
      "thread-2 (active) [active] approval:1 Current active thread summary.\nthread-1 [completed] human_recovery Completed repo scan and isolated runtime recovery work.",
    );
  });
});
