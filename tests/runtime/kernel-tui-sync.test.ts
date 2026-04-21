import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";
import { createTask } from "../../src/domain/task";
import { createThread } from "../../src/domain/thread";
import { HarnessSession } from "../../src/harness/core/session/harness-session";

/**
 * INTEGRATION SMOKE TEST: TUI -> KERNEL RESPONSIVENESS
 * Verifies that handleCommand returns a structured session payload synchronously.
 */
describe("Kernel-TUI Response Loop", () => {
  test("synchronously returns structured thread view on task submission", async () => {
    const workspaceRoot = "/tmp/test-resp";
    const dataDir = ":memory:";
    const context = await createAppContext({ workspaceRoot, dataDir });
    
    const session = new HarnessSession(
      { workspaceRoot, projectId: "test-p" },
      context
    );

    // 1. Simulate TUI submitting a task
    const result = await session.handleCommand({
      kind: "add_task",
      content: "Hello Test",
      background: false
    });

    // 2. ASSERTIONS: The response must be a structured session payload
    expect(result).toBeDefined();
    expect(result.status).toBeDefined();
    expect(result.threadId).toBeDefined();
    expect(result.threadId?.startsWith("thread_")).toBe(true);
  });

  test("hydrates agent run and message truth consistently after runtime commands", async () => {
    const workspaceRoot = "/tmp/test-agent-run-hydrate";
    const dataDir = ":memory:";
    const context = await createAppContext({ workspaceRoot, dataDir, projectId: "test-agentRuns" });

    const session = new HarnessSession(
      { workspaceRoot, projectId: "test-agentRuns" },
      context,
    );

    const thread = createThread("thread-agent-run-hydrate", workspaceRoot, "test-agentRuns");
    await context.stores.threadStore.save({ ...thread, status: "active" });
    await context.stores.taskStore.save(
      createTask("task-agent-run-hydrate", thread.threadId, "run-agent-run-hydrate", "hydrate agent run truth"),
    );

    await session.handleCommand({
      kind: "agent_run_spawn",
      threadId: thread.threadId,
      taskId: "task-agent-run-hydrate",
      role: "planner",
      spawnReason: "kernel tui sync verification",
    });

    const hydrated = await session.getSnapshot();
    expect(hydrated.agentRuns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          threadId: thread.threadId,
          roleKind: "legacy_internal",
          roleId: "planner",
          status: "running",
          spawnReason: "kernel tui sync verification",
        }),
      ]),
    );
    expect(hydrated.messages).toBeArray();
  });
});
