import { describe, expect, test } from "bun:test";
import { buildFinalResponderPrompt, buildPlannerPrompt } from "../../src/app/control-plane-support";
import { createThread } from "../../src/domain/thread";

describe("control-plane prompt support", () => {
  test("injects recent conversation transcript into planner and responder prompts", () => {
    const thread = createThread("thread-chat", "/workspace", "project-1");
    const threadView = {
      ...thread,
      recoveryFacts: {
        threadId: thread.threadId,
        revision: 1,
        schemaVersion: 1,
        status: "active",
        updatedAt: "2026-04-15T00:00:00.000Z",
        pendingApprovals: [],
        conversationHistory: [
          {
            messageId: "msg-user-name",
            role: "user" as const,
            content: "我叫测试用户",
            createdAt: "2026-04-15T00:00:00.000Z",
          },
          {
            messageId: "msg-assistant-name",
            role: "assistant" as const,
            content: "好的，我记住了。",
            createdAt: "2026-04-15T00:00:01.000Z",
          },
        ],
      },
    };

    const plannerPrompt = buildPlannerPrompt({
      text: "我叫什么？",
      threadView,
    });
    const responderPrompt = buildFinalResponderPrompt({
      text: "我叫什么？",
      threadView,
    });

    expect(plannerPrompt).toContain("Recent conversation transcript");
    expect(plannerPrompt).toContain("user: 我叫测试用户");
    expect(plannerPrompt).toContain("prefer a respond_only plan");
    expect(responderPrompt).toContain("Recent conversation transcript");
    expect(responderPrompt).toContain("user: 我叫测试用户");
    expect(responderPrompt).toContain("answer from the transcript");
  });
});
