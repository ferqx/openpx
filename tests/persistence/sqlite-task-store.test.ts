import { describe, expect, test } from "bun:test";
import { SqliteTaskStore } from "../../src/persistence/sqlite/sqlite-task-store";

describe("SqliteTaskStore", () => {
  test("persists and reloads tasks", async () => {
    const store = new SqliteTaskStore(":memory:");

    await store.save({ taskId: "task_1", threadId: "thread_1", status: "queued" });

    const task = await store.get("task_1");

    expect(task).toEqual({ taskId: "task_1", threadId: "thread_1", status: "queued" });
  });
});
