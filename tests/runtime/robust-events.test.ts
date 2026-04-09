import { describe, expect, test, afterEach } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";
import { RuntimeScopedSession } from "../../src/runtime/service/runtime-scoped-session";
import { createThread } from "../../src/domain/thread";
import { createTask } from "../../src/domain/task";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Robust Event Stream", () => {
  const testDir = path.join(os.tmpdir(), `robust-events-test-${Date.now()}-${Math.random()}`);

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test("replays buffered runtime events with monotonic sequence numbers", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "test.db");
    const workspaceRoot = testDir;

    const runtime = await createAppContext({ dataDir, workspaceRoot, projectId: "robust-events-project" });
    const session = new RuntimeScopedSession({ workspaceRoot, projectId: "robust-events-project" }, runtime);

    await session.handleCommand({ kind: "add_task", content: "test task" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const iterator = session.subscribeEvents(0)[Symbol.asyncIterator]();
    const first = await iterator.next();
    const second = await iterator.next();

    expect(first.value).toBeDefined();
    expect(second.value).toBeDefined();
    expect(first.value?.seq).toBeGreaterThan(0);
    expect(second.value?.seq).toBeGreaterThan(first.value?.seq ?? 0);
    expect(first.value?.timestamp).toBeString();
    expect(second.value?.traceId).toBeString();
  });

  test("delivers live stream events to active subscribers without duplicating sequence numbers", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const dataDir = path.join(testDir, "stream.db");
    const workspaceRoot = testDir;
    const context = await createAppContext({ dataDir, workspaceRoot, projectId: "stream-project" });
    const session = new RuntimeScopedSession({ workspaceRoot, projectId: "stream-project" }, context);

    const thread = createThread("thread-stream-1", workspaceRoot, "stream-project");
    await context.stores.threadStore.save({ ...thread, status: "active" });
    await context.stores.taskStore.save(
      createTask("task-stream-1", thread.threadId, "run-stream-1", "verify live stream replay"),
    );

    const iterator = session.subscribeEvents(0)[Symbol.asyncIterator]();
    const nextEventPromise = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 20));

    context.kernel.events.publishStream({
      eventId: "stream-event-1",
      threadId: thread.threadId,
      taskId: "task-stream-1",
      turnId: "turn-stream-1",
      seq: 1,
      timestamp: new Date().toISOString(),
      type: "stream.text_chunk",
      payload: {
        content: "live chunk",
        index: 0,
      },
    });

    const first = await nextEventPromise;
    expect(first.value?.event.type).toBe("stream.text_chunk");
    expect(first.value?.event.payload).toEqual({
      content: "live chunk",
      index: 0,
    });

    context.kernel.events.publish({
      type: "model.status",
      payload: {
        status: "responding",
      },
    });

    const second = await iterator.next();
    expect(second.value?.event.type).toBe("model.status");
    expect(second.value?.seq).toBeGreaterThan(first.value?.seq ?? 0);
  });
});
