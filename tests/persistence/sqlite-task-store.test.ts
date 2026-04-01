import { describe, expect, test } from "bun:test";
import { createSqlite } from "../../src/persistence/sqlite/sqlite-client";
import { SqliteMemoryStore } from "../../src/persistence/sqlite/sqlite-memory-store";
import { SqliteTaskStore } from "../../src/persistence/sqlite/sqlite-task-store";

describe("SqliteTaskStore", () => {
  test("persists and reloads tasks", async () => {
    const store = new SqliteTaskStore(":memory:");

    await store.save({ taskId: "task_1", threadId: "thread_1", status: "queued" });

    const task = await store.get("task_1");

    expect(task).toEqual({ taskId: "task_1", threadId: "thread_1", status: "queued" });
  });

  test("does not close an injected database that is shared by another store", async () => {
    const db = createSqlite(":memory:");
    const taskStore = new SqliteTaskStore(db);
    const memoryStore = new SqliteMemoryStore(db);

    await taskStore.save({ taskId: "task_1", threadId: "thread_1", status: "queued" });
    await taskStore.close();

    await memoryStore.save({
      memoryId: "memory_1",
      namespace: "durable",
      key: "decision_1",
      value: "Use Ink",
      threadId: "thread_1",
    });

    const record = await memoryStore.get("memory_1");

    expect(record?.value).toBe("Use Ink");

    db.close();
  });
});
