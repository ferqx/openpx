import { describe, expect, test } from "bun:test";
import { createRun, transitionRun } from "../../src/domain/run";
import { SqliteRunStore } from "../../src/persistence/sqlite/sqlite-run-store";

describe("SqliteRunStore", () => {
  test("persists and reloads runs by thread", async () => {
    const store = new SqliteRunStore(":memory:");
    const run = transitionRun(
      createRun({
        runId: "run_1",
        threadId: "thread_1",
        trigger: "user_input",
        inputText: "scan repo",
      }),
      "running",
    );

    await store.save(run);

    expect(await store.get("run_1")).toEqual(run);
    expect(await store.listByThread("thread_1")).toEqual([run]);
    expect(await store.getLatestByThread("thread_1")).toEqual(run);
  });
});
