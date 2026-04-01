import { describe, expect, test } from "bun:test";
import { SqliteMemoryStore } from "../../src/persistence/sqlite/sqlite-memory-store";

describe("SqliteMemoryStore", () => {
  test("scopes durable memory by namespace", async () => {
    const store = new SqliteMemoryStore(":memory:");

    await store.put(["project", "demo"], "decision_1", { kind: "decision", value: "Use Ink" });
    await store.put(["project", "other"], "decision_2", { kind: "decision", value: "Use React" });

    const results = await store.search(["project", "demo"], { query: "Ink", limit: 5 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      key: "decision_1",
      namespace: ["project", "demo"],
      value: { kind: "decision", value: "Use Ink" },
    });
  });
});
