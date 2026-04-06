import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";
import { createThread } from "../../src/domain/thread";
import { createControlTask } from "../../src/control/tasks/task-types";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

function createTestModelGateway() {
  return {
    async plan() {
      return { summary: "plan" };
    },
    async verify() {
      return { summary: "verified", isValid: true };
    },
    async respond() {
      return { summary: "responded" };
    },
    onStatusChange() {
      return () => {};
    },
    onEvent() {
      return () => {};
    },
  };
}

describe("createAppContext", () => {
  test("builds a local sqlite-backed app context", async () => {
    const ctx = await createAppContext({
      workspaceRoot: "/tmp/demo-workspace",
      dataDir: ":memory:",
      modelGateway: createTestModelGateway(),
    });

    expect(ctx.config.workspaceRoot).toBe("/tmp/demo-workspace");
    expect(ctx.config.checkpointConnString).toBe(":memory:");
    expect(ctx.config.model).toBeDefined();
    expect(typeof ctx.kernel.handleCommand).toBe("function");
  });

  test("rehydrates durable thread narrative summaries across app boots", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `openpx-narrative-${Date.now()}`);
    const dataDir = path.join(workspaceRoot, "openpx.db");

    await fs.mkdir(workspaceRoot, { recursive: true });

    const first = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: createTestModelGateway(),
    });

    const thread = createThread("thread-persisted", workspaceRoot, first.config.projectId);
    await first.stores.threadStore.save(thread);
    await first.narrativeService.processTaskUpdate(
      createControlTask({
        taskId: "task-1",
        threadId: thread.threadId,
        summary: "Completed repo scan and isolated runtime recovery work.",
        status: "completed",
      }),
    );

    const second = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: createTestModelGateway(),
    });

    const narrative = await second.narrativeService.getNarrative(thread.threadId);
    expect(narrative.summary).toContain("Completed repo scan and isolated runtime recovery work.");
    expect(narrative.revision).toBe(1);

    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  test("builds responder prompts from thread narrative and working context", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `openpx-respond-context-${Date.now()}`);
    const dataDir = path.join(workspaceRoot, "openpx.db");
    const prompts: string[] = [];

    await fs.mkdir(workspaceRoot, { recursive: true });

    const ctx = await createAppContext({
      workspaceRoot,
      dataDir,
      modelGateway: {
        async plan() {
          return { summary: "plan" };
        },
        async verify() {
          return { summary: "verified", isValid: true };
        },
        async respond(input) {
          prompts.push(input.prompt);
          return { summary: "You told me your name is Alice." };
        },
        onStatusChange() {
          return () => {};
        },
        onEvent() {
          return () => {};
        },
      },
    });

    const thread = {
      ...createThread("thread-memory", workspaceRoot, ctx.config.projectId),
      narrativeState: {
        revision: 2,
        updatedAt: new Date().toISOString(),
        threadSummary: "The user introduced themselves earlier in the thread.",
        taskSummaries: ["User said their name is Alice."],
        openLoops: [],
        notableEvents: ["Remember the user's preferred name."],
      },
      workingSetWindow: {
        revision: 1,
        updatedAt: new Date().toISOString(),
        messages: ["User: My name is Alice."],
        toolResults: [],
        verifierFeedback: [],
        retrievedMemories: ["durable memory: user_name=Alice"],
      },
      recoveryFacts: {
        threadId: "thread-memory",
        revision: 2,
        schemaVersion: 1,
        status: "active",
        updatedAt: new Date().toISOString(),
        pendingApprovals: [],
        latestDurableAnswer: {
          answerId: "answer-memory",
          summary: "Your name is Alice.",
          createdAt: new Date().toISOString(),
        },
      },
    };
    await ctx.stores.threadStore.save(thread);

    await ctx.controlPlane.startRootTask(thread.threadId, "what is my name?");

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Current user request: what is my name?");
    expect(prompts[0]).toContain("The user introduced themselves earlier in the thread.");
    expect(prompts[0]).toContain("User said their name is Alice.");
    expect(prompts[0]).toContain("User: My name is Alice.");
    expect(prompts[0]).toContain("Your name is Alice.");

    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });
});
