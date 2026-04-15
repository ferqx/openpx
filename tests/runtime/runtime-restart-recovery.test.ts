import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";
import { createHarnessSessionRegistry } from "../../src/harness/server/harness-session-registry";
import { createThread } from "../../src/domain/thread";
import { createTask } from "../../src/domain/task";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Runtime Restart Recovery", () => {
  const testDir = path.join(os.tmpdir(), `runtime-restart-recovery-test-${Date.now()}-${Math.random()}`);

  test("promotes uncertain executions into blocked human recovery state on boot", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "test.db");
    const workspaceRoot = testDir;
    const projectId = "restart-recovery-project";

    const firstBoot = await createAppContext({ dataDir, workspaceRoot, projectId });

    const thread = createThread("thread-recovery-1", workspaceRoot, projectId);
    await firstBoot.stores.threadStore.save({ ...thread, status: "active" });

    const task = createTask("task-recovery-1", thread.threadId, "Apply risky patch");
    await firstBoot.stores.taskStore.save({ ...task, status: "running" });

    await firstBoot.stores.executionLedger.save({
      executionId: "tc-recovery-1:exec",
      threadId: thread.threadId,
      taskId: task.taskId,
      toolCallId: "tc-recovery-1",
      toolName: "apply_patch",
      argsJson: JSON.stringify({ path: "src/index.ts" }),
      status: "started",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const secondBoot = await createAppContext({ dataDir, workspaceRoot, projectId });

    const recoveredThread = await secondBoot.stores.threadStore.get(thread.threadId);
    const recoveredTask = await secondBoot.stores.taskStore.get(task.taskId);
    const recoveredLedger = await secondBoot.stores.executionLedger.get("tc-recovery-1:exec");

    expect(recoveredThread?.status).toBe("active");
    expect(recoveredTask?.status).toBe("blocked");
    expect(recoveredTask?.blockingReason?.kind).toBe("human_recovery");
    expect(recoveredLedger?.status).toBe("unknown_after_crash");

    const blockedResult = await secondBoot.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "continue working" },
    });

    const scopedThreads = await secondBoot.stores.threadStore.listByScope({ workspaceRoot, projectId });
    expect(blockedResult.threadId).toBe(thread.threadId);
    expect(blockedResult.status).toBe("blocked");
    expect(scopedThreads).toHaveLength(1);

    const runtime = await createHarnessSessionRegistry({ dataDir, workspaceRoot, projectId });
    const replay = runtime.subscribeEvents({ workspaceRoot, projectId }, 0)[Symbol.asyncIterator]();

    const readNext = () =>
      Promise.race([
        replay.next(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out waiting for replay event")), 200)),
      ]);

    const first = await readNext();
    const second = await readNext();
    const replayedTypes = [first.value?.event?.type, second.value?.event?.type];

    expect(replayedTypes).toContain("thread.blocked");
    expect(replayedTypes).toContain("task.updated");
  });
});
