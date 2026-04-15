import { describe, expect, test } from "bun:test";
import { createThread } from "../../src/domain/thread";
import { createRun, transitionRun } from "../../src/domain/run";
import { buildStableSessionArtifacts, deriveProjectedExecutionStatus, projectSessionResult } from "../../src/harness/core/projection/session-view-projector";

describe("projectSessionResult", () => {
  test("builds a stable session view from thread and summary data", async () => {
    const thread = createThread("thread-1", "/workspace", "project-1");
    const result = await projectSessionResult({
      thread,
      status: "completed",
      workspaceRoot: "/workspace",
      projectId: "project-1",
      finalResponse: "Completed repo scan",
      latestExecutionStatus: "completed",
      approvals: [],
      threads: [
        {
          threadId: "thread-1",
          status: "completed",
          narrativeSummary: "Completed repo scan",
          pendingApprovalCount: 0,
        },
      ],
    });

    expect(result.threadId).toBe("thread-1");
    expect(result.status).toBe("completed");
    expect(result.finalResponse).toBe("Completed repo scan");
    expect(result.latestExecutionStatus).toBe("completed");
    expect(result.threads).toHaveLength(1);
  });

  test("builds stable artifacts from thread recovery facts and worker records", () => {
    const artifacts = buildStableSessionArtifacts({
      thread: {
        threadId: "thread-1",
        recoveryFacts: {
          threadId: "thread-1",
          revision: 2,
          schemaVersion: 1,
          status: "completed",
          updatedAt: "2026-04-09T00:00:00.000Z",
          pendingApprovals: [],
          conversationHistory: [
            {
              messageId: "message-1",
              role: "user",
              content: "Inspect runtime truth",
              createdAt: "2026-04-09T00:00:00.000Z",
            },
          ],
          latestDurableAnswer: {
            answerId: "answer-1",
            summary: "Runtime truth inspected",
            createdAt: "2026-04-09T00:00:01.000Z",
          },
        },
      },
      workers: [
        {
          workerId: "worker-1",
          threadId: "thread-1",
          taskId: "task-1",
          role: "planner",
          status: "running",
          spawnReason: "inspect runtime truth",
          startedAt: "2026-04-09T00:00:00.000Z",
          resumeToken: "resume-1",
        },
      ],
    });

    expect(artifacts.answers).toEqual([
      {
        answerId: "answer-1",
        threadId: "thread-1",
        content: "Runtime truth inspected",
      },
    ]);
    expect(artifacts.messages).toEqual([
      {
        messageId: "message-1",
        threadId: "thread-1",
        role: "user",
        content: "Inspect runtime truth",
      },
    ]);
    expect(artifacts.workers).toEqual([
      expect.objectContaining({
        workerId: "worker-1",
        role: "planner",
        status: "running",
      }),
    ]);
  });

  test("derives projected execution status from the latest run instead of thread container state", () => {
    const latestRun = transitionRun(
      transitionRun(createRun({ runId: "run-1", threadId: "thread-1", trigger: "user_input" }), "running"),
      "waiting_approval",
    );

    expect(deriveProjectedExecutionStatus(latestRun, "active")).toBe("waiting_approval");
    expect(deriveProjectedExecutionStatus(undefined, "archived")).toBe("completed");
  });
});
