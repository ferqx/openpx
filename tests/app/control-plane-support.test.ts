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

  test("plan mode asks for an executable plan and decision options instead of stopping after planning", () => {
    const thread = {
      ...createThread("thread-plan-mode-prompt", "/workspace", "project-1"),
      threadMode: "plan" as const,
    };

    const plannerPrompt = buildPlannerPrompt({
      text: "我要开发一个登录界面",
      threadView: thread,
    });

    expect(plannerPrompt).toContain("Current thread mode: plan");
    expect(plannerPrompt).toContain("continue into execution");
    expect(plannerPrompt).toContain("2-3 concrete options");
    expect(plannerPrompt).not.toContain("Do not assume this turn will execute file changes");
  });

  test("plan mode final responder prompt asks for plan and execution result", () => {
    const thread = {
      ...createThread("thread-plan-mode-response", "/workspace", "project-1"),
      threadMode: "plan" as const,
    };

    const responderPrompt = buildFinalResponderPrompt({
      text: "我要开发一个登录界面",
      threadView: thread,
      plannerResult: {
        workPackages: [
          {
            id: "pkg_login_ui",
            objective: "实现登录界面",
            capabilityMarker: "implementation_work" as const,
            capabilityFamily: "feature_implementation" as const,
            allowedTools: ["read_file", "apply_patch"],
            inputRefs: ["thread:goal"],
            expectedArtifacts: ["patch:workspace"],
          },
        ],
        acceptanceCriteria: ["登录界面可输入账号和密码"],
        riskFlags: [],
        approvalRequiredActions: [],
        verificationScope: ["UI smoke check"],
      },
    });

    expect(responderPrompt).toContain("Plan mode final response contract");
    expect(responderPrompt).toContain("计划方案");
    expect(responderPrompt).toContain("执行结果");
    expect(responderPrompt).toContain("方案选项");
  });
});
