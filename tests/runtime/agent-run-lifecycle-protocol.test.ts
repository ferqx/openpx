import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAppContext } from "../../src/app/bootstrap";
import { createHarnessSessionRegistry } from "../../src/harness/server/harness-session-registry";
import { createThread } from "../../src/domain/thread";
import { createTask, transitionTask } from "../../src/domain/task";
import { createAgentRunRecord, transitionAgentRun } from "../../src/domain/agent-run";

describe("agent run lifecycle protocol", () => {
  const testDir = path.join(os.tmpdir(), `agent-run-lifecycle-protocol-${Date.now()}-${Math.random()}`);

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // SQLite handles can linger briefly on Windows in integration tests.
    }
  });

  test("stores agent run lifecycle state and lists active agent runs per thread", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "agent-run.sqlite");
    const app = await createAppContext({
      dataDir,
      workspaceRoot: testDir,
      projectId: "agent-run-project",
    });

    const agentRun = transitionAgentRun(
      transitionAgentRun(
        createAgentRunRecord({
          agentRunId: "agent_run-1",
          threadId: "thread-1",
          taskId: "task-1",
          role: "planner",
          spawnReason: "initial planning",
          resumeToken: "resume-1",
        }),
        "starting",
        { startedAt: "2026-04-06T00:00:00.000Z" },
      ),
      "running",
      { resumeToken: "resume-1" },
    );

    await app.stores.agentRunStore.save(agentRun);

    const reloaded = await app.stores.agentRunStore.get(agentRun.agentRunId);
    const activeAgentRuns = await app.stores.agentRunStore.listActiveByThread(agentRun.threadId);

    expect(reloaded).toEqual(agentRun);
    expect(activeAgentRuns).toEqual([agentRun]);

    const completedAgentRun = transitionAgentRun(agentRun, "completed", {
      endedAt: "2026-04-06T00:01:00.000Z",
      resumeToken: undefined,
    });
    await app.stores.agentRunStore.save(completedAgentRun);

    expect(await app.stores.agentRunStore.listActiveByThread(agentRun.threadId)).toEqual([]);
    await app.close();
  });

  test("hydrates agent run views into runtime snapshots", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "runtime.sqlite");
    const projectId = "agent-run-runtime-project";
    const app = await createAppContext({ dataDir, workspaceRoot: testDir, projectId });

    const thread = createThread("thread-agent-run-1", testDir, projectId);
    await app.stores.threadStore.save({ ...thread, status: "active" });

    const task = transitionTask(createTask("task-agent-run-1", thread.threadId, "Plan agent-run execution"), "running");
    await app.stores.taskStore.save(task);

    const agentRun = transitionAgentRun(
      transitionAgentRun(
        createAgentRunRecord({
          agentRunId: "agent_run-2",
          threadId: thread.threadId,
          taskId: task.taskId,
          role: "planner",
          spawnReason: "initial planning",
          resumeToken: "resume-agent-run-1",
        }),
        "starting",
        { startedAt: "2026-04-06T00:00:00.000Z" },
      ),
      "running",
      { resumeToken: "resume-agent-run-1" },
    );
    await app.stores.agentRunStore.save(agentRun);

    const runtime = await createHarnessSessionRegistry({ dataDir, workspaceRoot: testDir, projectId });
    const snapshot = await runtime.getSnapshot({ workspaceRoot: testDir, projectId });

    expect(snapshot.activeThreadId).toBe(thread.threadId);
    expect(snapshot.agentRuns).toEqual([
      expect.objectContaining({
        agentRunId: agentRun.agentRunId,
        threadId: agentRun.threadId,
        taskId: agentRun.taskId,
        roleKind: "legacy_internal",
        roleId: "planner",
        status: "running",
        spawnReason: "initial planning",
        startedAt: "2026-04-06T00:00:00.000Z",
        resumeToken: "resume-agent-run-1",
      }),
    ]);
    await app.close();
  });
});
