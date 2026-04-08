import { describe, expect, test } from "bun:test";
import { buildRuntimeSnapshot } from "../../src/runtime/service/runtime-snapshot";

describe("Runtime snapshot", () => {
  test("includes narrative summary in the client-facing snapshot contract", () => {
    const snapshot = buildRuntimeSnapshot({
      scope: {
        workspaceRoot: "/tmp/workspace",
        projectId: "project-1",
      },
      activeRunId: "run-1",
      activeThread: {
        threadId: "thread-1",
        workspaceRoot: "/tmp/workspace",
        projectId: "project-1",
        revision: 2,
        status: "active",
      },
      threads: [
        {
          threadId: "thread-1",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          revision: 2,
          status: "active",
          activeRunId: "run-1",
          activeRunStatus: "completed",
          narrativeSummary: "Completed repo scan and isolated the runtime recovery path.",
          narrativeRevision: 1,
          pendingApprovalCount: 1,
          blockingReasonKind: "human_recovery",
        },
      ],
      runs: [
        {
          runId: "run-1",
          threadId: "thread-1",
          status: "completed",
          trigger: "user_input",
          startedAt: new Date().toISOString(),
          resultSummary: "Completed repo scan and isolated the runtime recovery path.",
        },
      ],
      tasks: [],
      pendingApprovals: [],
      workers: [],
      events: [],
      fallbackLastEventSeq: 0,
      narrativeSummary: "Completed repo scan and isolated the runtime recovery path.",
    });

    expect(snapshot.narrativeSummary).toBe("Completed repo scan and isolated the runtime recovery path.");
    expect(snapshot.activeRunId).toBe("run-1");
    expect(snapshot.runs[0]?.resultSummary).toBe("Completed repo scan and isolated the runtime recovery path.");
    expect(snapshot.threads[0]?.activeRunId).toBe("run-1");
    expect(snapshot.threads[0]?.narrativeSummary).toBe("Completed repo scan and isolated the runtime recovery path.");
    expect(snapshot.threads[0]?.pendingApprovalCount).toBe(1);
    expect(snapshot.threads[0]?.blockingReasonKind).toBe("human_recovery");
    expect(snapshot.workers).toEqual([]);
  });

  test("prefers recovery facts and narrative state over loose event reconstruction", () => {
    const snapshot = buildRuntimeSnapshot({
      scope: {
        workspaceRoot: "/tmp/workspace",
        projectId: "project-1",
      },
      activeRunId: "run-2",
      threads: [],
      runs: [
        {
          runId: "run-2",
          threadId: "thread-1",
          status: "blocked",
          trigger: "approval_resume",
          startedAt: new Date().toISOString(),
          blockingReason: {
            kind: "human_recovery",
            message: "Manual recovery required before continuing.",
          },
        },
      ],
      tasks: [],
      pendingApprovals: [],
      workers: [],
      events: [],
      fallbackLastEventSeq: 0,
      activeThread: {
        threadId: "thread-1",
        workspaceRoot: "/tmp/workspace",
        projectId: "project-1",
        revision: 2,
        status: "active",
        recoveryFacts: {
          threadId: "thread-1",
          revision: 2,
          schemaVersion: 1,
          status: "blocked",
          updatedAt: new Date().toISOString(),
          pendingApprovals: [],
          conversationHistory: [
            {
              messageId: "message-1",
              role: "user",
              content: "What is the status?",
              createdAt: new Date().toISOString(),
            },
            {
              messageId: "message-2",
              role: "assistant",
              content: "Runtime snapshot migration is paused.",
              createdAt: new Date().toISOString(),
            },
          ],
          blocking: {
            sourceTaskId: "task-1",
            kind: "human_recovery",
            message: "Manual recovery required before continuing.",
          },
          latestDurableAnswer: {
            answerId: "answer-1",
            summary: "Runtime snapshot migration is paused.",
            createdAt: new Date().toISOString(),
          },
        },
        narrativeState: {
          revision: 1,
          threadSummary: "Runtime snapshot migration is paused.",
          taskSummaries: [],
          openLoops: [],
          notableEvents: [],
          updatedAt: new Date().toISOString(),
        },
      },
    });

    expect(snapshot.blockingReason?.kind).toBe("human_recovery");
    expect(snapshot.activeRunId).toBe("run-2");
    expect(snapshot.runs[0]?.status).toBe("blocked");
    expect(snapshot.narrativeSummary).toBe("Runtime snapshot migration is paused.");
    expect(snapshot.answers).toEqual([
      {
        answerId: "answer-1",
        threadId: "thread-1",
        content: "Runtime snapshot migration is paused.",
      },
    ]);
    expect(snapshot.messages).toEqual([
      {
        messageId: "message-1",
        threadId: "thread-1",
        role: "user",
        content: "What is the status?",
      },
      {
        messageId: "message-2",
        threadId: "thread-1",
        role: "assistant",
        content: "Runtime snapshot migration is paused.",
      },
    ]);
  });
});
