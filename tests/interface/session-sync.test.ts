import { describe, expect, test } from "bun:test";
import { buildDisplayMessages, deriveMessagesFromSession, mergeThreadViewIntoSession } from "../../src/surfaces/tui/session-sync";

describe("session-sync", () => {
  test("derives assistant display from final response when transcript arrays are absent", () => {
    const messages = deriveMessagesFromSession({
      primaryAgent: "build",
      threadMode: "normal",
      status: "completed",
      threadId: "thread-summary",
      finalResponse: "Projected summary",
      workspaceRoot: "/workspace",
      projectId: "project-1",
      tasks: [],
      approvals: [],
      answers: [],
      messages: [],
      workers: [],
      threads: [],
    });

    expect(messages).toEqual([
      {
        id: "assistant-summary-thread-summary",
        role: "assistant",
        content: "Projected summary",
        timestamp: expect.any(Number),
      },
    ]);
  });

  test("rebuilds thread view collections from protocol truth instead of stale current state", () => {
    const merged = mergeThreadViewIntoSession(
      {
        primaryAgent: "build",
        threadMode: "normal",
        status: "completed",
        threadId: "thread-sync",
        finalResponse: "Old summary",
        workspaceRoot: "/workspace",
        projectId: "project-1",
        tasks: [
          {
            taskId: "task-old",
            threadId: "thread-sync",
            runId: "run-old",
            status: "running",
            summary: "Old task",
          },
        ],
        approvals: [
          {
            approvalRequestId: "approval-old",
            threadId: "thread-sync",
            runId: "run-old",
            taskId: "task-old",
            toolCallId: "tool-old",
            summary: "Old approval",
            risk: "risk",
            status: "pending",
          },
        ],
        answers: [
          {
            answerId: "answer-old",
            threadId: "thread-sync",
            content: "Old answer",
          },
        ],
        messages: [
          {
            messageId: "msg-old",
            threadId: "thread-sync",
            role: "assistant",
            content: "Old answer",
          },
        ],
        workers: [
          {
            workerId: "worker-old",
            threadId: "thread-sync",
            taskId: "task-old",
            role: "planner",
            status: "running",
            spawnReason: "old",
          },
        ],
        threads: [],
      },
      {
        threadId: "thread-sync",
        status: "completed",
        threadMode: "normal",
        finalResponse: "Fresh summary",
        recoveryFacts: {
          threadId: "thread-sync",
          revision: 2,
          schemaVersion: 1,
          status: "completed",
          updatedAt: new Date().toISOString(),
          pendingApprovals: [],
          conversationHistory: [
            {
              messageId: "msg-new",
              role: "assistant",
              content: "Fresh message",
              createdAt: new Date().toISOString(),
            },
          ],
          latestDurableAnswer: {
            answerId: "answer-new",
            summary: "Fresh answer",
            createdAt: new Date().toISOString(),
          },
        },
      },
    );

    expect(merged.tasks).toEqual([]);
    expect(merged.approvals).toEqual([]);
    expect(merged.workers).toEqual([]);
    expect(merged.answers[0]?.content).toBe("Fresh answer");
    expect(merged.messages?.[0]?.content).toBe("Fresh message");
  });

  test("clears stale blocking truth when thread view returns to a completed state", () => {
    const merged = mergeThreadViewIntoSession(
      {
        primaryAgent: "build",
        threadMode: "normal",
        status: "blocked",
        threadId: "thread-sync",
        pauseSummary: "Blocked summary",
        workspaceRoot: "/workspace",
        projectId: "project-1",
        tasks: [],
        approvals: [],
        answers: [],
        messages: [],
        workers: [],
        blockingReason: {
          kind: "human_recovery",
          message: "Old blocked state",
        },
        threads: [],
      },
      {
        threadId: "thread-sync",
        status: "completed",
        threadMode: "normal",
        finalResponse: "Recovered summary",
      },
    );

    expect(merged.status).toBe("completed");
    expect(merged.blockingReason).toBeUndefined();
    expect(merged.finalResponse).toBe("Recovered summary");
  });

  test("combines session truth with transient display-only overlays", () => {
    const messages = buildDisplayMessages({
      session: {
        primaryAgent: "build",
        threadMode: "normal",
        status: "completed",
        threadId: "thread-display",
        finalResponse: "Durable summary",
        workspaceRoot: "/workspace",
        projectId: "project-1",
        tasks: [],
        approvals: [],
        answers: [],
        messages: [],
        workers: [],
        threads: [],
      },
      pendingUserMessage: {
        id: "user-1",
        role: "user",
        content: "ship it",
        timestamp: 1,
      },
      streamedAssistantMessage: {
        id: "assistant-1",
        role: "assistant",
        content: "Working on it",
        timestamp: 2,
      },
    });

    expect(messages.map((message) => message.content)).toEqual([
      "Durable summary",
      "ship it",
      "Working on it",
    ]);
  });
});
