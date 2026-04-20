import { describe, expect, test } from "bun:test";
import {
  buildChromeView,
  buildComposerView,
  buildConversationView,
  buildUtilityView,
} from "../../src/surfaces/tui/app-screen-view";

describe("app screen view builders", () => {
  test("builds conversation and utility slices from app state", () => {
    const session = {
      status: "completed" as const,
      primaryAgent: "build" as const,
      threadMode: "normal" as const,
      finalResponse: "Awaiting answer",
      threadId: "thread-1",
      workspaceRoot: "/tmp/workspace",
      projectId: "project-1",
      tasks: [],
      approvals: [],
      answers: [],
      messages: [],
      agentRuns: [],
      narrativeSummary: "summary",
      threads: [
        {
          threadId: "thread-1",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          revision: 1,
          status: "active" as const,
          threadMode: "normal" as const,
        },
      ],
    };

    const conversationView = buildConversationView({
      conversationState: {
        modelStatus: "responding",
        messages: [{ id: "m1", role: "assistant", content: "hi", timestamp: 1 }],
        performance: { waitMs: 10, genMs: 20 },
        streamScrollOffset: 2,
      },
      session,
      hasCreatedThreadThisLaunch: false,
    });

    const utilityView = buildUtilityView({
      activeUtilityPane: "sessions",
      utilitySession: {
        threadId: session.threadId,
        workspaceRoot: session.workspaceRoot,
        narrativeSummary: session.narrativeSummary,
        answers: session.answers,
        messages: session.messages,
        threads: session.threads,
      },
      settingsConfig: undefined,
      selectedSessionIndex: 0,
    });

    expect(conversationView.showWelcome).toBe(true);
    expect(conversationView.modelStatus).toBe("responding");
    expect(conversationView.agentRuns).toEqual([]);
    expect(utilityView.selectedSessionThreadId).toBe("thread-1");
  });

  test("builds chrome and composer slices", () => {
    const chromeView = buildChromeView({
      session: {
        status: "blocked",
        pauseSummary: "blocked",
        primaryAgent: "build",
        threadMode: "plan",
        threadId: "thread-1",
        workspaceRoot: "/tmp/workspace",
        projectId: "project-1",
        tasks: [],
        approvals: [],
        answers: [],
        messages: [],
        agentRuns: [],
        blockingReason: { kind: "human_recovery", message: "Inspect workspace" },
        threads: [],
      },
      runtimeStatus: "connected",
      stage: "blocked",
      showThreadPanel: true,
      modelName: "model",
      thinkingLevel: "default",
    });

    const composerView = buildComposerView({
      composerMode: "input",
      submit: () => undefined,
      onCommandMenuOpenChange: () => undefined,
      onComposerEscape: () => undefined,
      onSettingsSave: async () => undefined,
      onSettingsClose: () => undefined,
    });

    expect(chromeView.primaryAgent).toBe("build");
    expect(chromeView.threadMode).toBe("plan");
    expect(chromeView.stage).toBe("blocked");
    expect(chromeView.showThreadPanel).toBe(true);
    expect(composerView.composerMode).toBe("input");
  });
});
