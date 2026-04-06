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
});
