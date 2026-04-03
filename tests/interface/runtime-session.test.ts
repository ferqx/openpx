import { describe, expect, test } from "bun:test";
import { deriveRuntimeSession } from "../../src/interface/runtime/runtime-session";

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
    });

    expect(session).toEqual({
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
});
