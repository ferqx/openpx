import { describe, expect, test } from "bun:test";
import { createTaskManager } from "../../src/control/tasks/task-manager";
import { createSqlite } from "../../src/persistence/sqlite/sqlite-client";
import { SqliteEventLog } from "../../src/persistence/sqlite/sqlite-event-log";
import { SqliteTaskStore } from "../../src/persistence/sqlite/sqlite-task-store";

describe("TaskManager", () => {
  test("creates a root task in queued state", async () => {
    const savedTasks: Array<{
      taskId: string;
      threadId: string;
      runId: string;
      summary: string;
      status: string;
    }> = [];
    const appendedEvents: Array<{ type: string; threadId: string; payload?: Record<string, unknown> }> = [];
    const manager = createTaskManager({
      taskStore: {
        async save(task) {
          savedTasks.push(task);
        },
      },
      eventLog: {
        async append(event) {
          appendedEvents.push(event);
        },
      },
    });

    const task = await manager.createRootTask("thread_1", "plan repo");

    expect(task.status).toBe("queued");
    expect(task.threadId).toBe("thread_1");
    expect(task.summary).toBe("plan repo");
    expect(task.taskId).toStartWith("task_");
    expect(savedTasks).toEqual([task]);
    expect(appendedEvents).toHaveLength(1);
    expect(appendedEvents[0]).toMatchObject({
      threadId: "thread_1",
      type: "task.created",
      payload: {
        taskId: task.taskId,
        summary: "plan repo",
        status: "queued",
      },
    });
  });

  test("persists root task summary through the sqlite task store", async () => {
    const db = createSqlite(":memory:");
    const taskStore = new SqliteTaskStore(db);
    const eventLog = new SqliteEventLog(db);
    const manager = createTaskManager({
      taskStore,
      eventLog,
    });

    const created = await manager.createRootTask("thread_1", "plan repo");
    const reloaded = await taskStore.get(created.taskId);

    expect(reloaded).toEqual({
      taskId: created.taskId,
      threadId: "thread_1",
      runId: created.runId,
      summary: "plan repo",
      status: "queued",
    });

    db.close();
  });

  test("still returns the created task when event logging fails after persistence", async () => {
    const savedTasks: Array<{
      taskId: string;
      threadId: string;
      runId: string;
      summary: string;
      status: string;
    }> = [];
    const manager = createTaskManager({
      taskStore: {
        async save(task) {
          savedTasks.push(task);
        },
      },
      eventLog: {
        async append() {
          throw new Error("event log unavailable");
        },
      },
    });

    const task = await manager.createRootTask("thread_1", "plan repo");

    expect(task).toMatchObject({
      threadId: "thread_1",
      summary: "plan repo",
      status: "queued",
    });
    expect(savedTasks).toEqual([task]);
  });

  test("creates distinct task and event IDs when the timestamp collides", async () => {
    const originalDateNow = Date.now;
    Date.now = () => 1234567890;

    const savedTasks: Array<{
      taskId: string;
      threadId: string;
      summary: string;
      status: string;
    }> = [];
    const appendedEvents: Array<{ eventId: string; type: string }> = [];
    const manager = createTaskManager({
      taskStore: {
        async save(task) {
          savedTasks.push(task);
        },
      },
      eventLog: {
        async append(event) {
          appendedEvents.push({
            eventId: event.eventId,
            type: event.type,
          });
        },
      },
    });

    try {
      const first = await manager.createRootTask("thread_1", "plan repo");
      const second = await manager.createRootTask("thread_1", "plan repo");

      expect(new Set([first.taskId, second.taskId]).size).toBe(2);
      expect(new Set(appendedEvents.map((event) => event.eventId)).size).toBe(2);
      expect(savedTasks).toHaveLength(2);
    } finally {
      Date.now = originalDateNow;
    }
  });
});
