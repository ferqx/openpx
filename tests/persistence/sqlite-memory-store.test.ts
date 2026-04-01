import { describe, expect, test } from "bun:test";
import { SqliteMemoryStore } from "../../src/persistence/sqlite/sqlite-memory-store";

describe("SqliteMemoryStore", () => {
  test("persists and searches durable memory records using the domain shape", async () => {
    const store = new SqliteMemoryStore(":memory:");

    await store.save({
      memoryId: "memory_1",
      namespace: "durable",
      key: "decision_1",
      value: "Use Ink",
      threadId: "thread_1",
    });
    await store.save({
      memoryId: "memory_2",
      namespace: "thread",
      key: "decision_2",
      value: "Use React",
      threadId: "thread_1",
    });

    const results = await store.search("durable", { query: "Ink", limit: 5 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      memoryId: "memory_1",
      key: "decision_1",
      namespace: "durable",
      value: "Use Ink",
      threadId: "thread_1",
      createdAt: expect.any(String),
    });
  });

  test("preserves createdAt when updating an existing memory record", async () => {
    const store = new SqliteMemoryStore(":memory:");

    await store.save({
      memoryId: "memory_1",
      namespace: "durable",
      key: "decision_1",
      value: "Use Ink",
      threadId: "thread_1",
      createdAt: "2026-04-01T00:00:00.000Z",
    });
    await store.save({
      memoryId: "memory_1",
      namespace: "durable",
      key: "decision_1",
      value: "Use Bun",
      threadId: "thread_1",
    });

    const record = await store.get("memory_1");

    expect(record).toEqual({
      memoryId: "memory_1",
      namespace: "durable",
      key: "decision_1",
      value: "Use Bun",
      threadId: "thread_1",
      createdAt: "2026-04-01T00:00:00.000Z",
    });
  });
});
