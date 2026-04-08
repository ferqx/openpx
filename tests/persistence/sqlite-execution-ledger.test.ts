import { describe, expect, test } from "bun:test";
import { SqliteExecutionLedger } from "../../src/persistence/sqlite/sqlite-execution-ledger";
import { createSqlite } from "../../src/persistence/sqlite/sqlite-client";
import { migrateSqlite } from "../../src/persistence/sqlite/sqlite-migrator";

describe("SqliteExecutionLedger", () => {
  test("records planned, started, completed, and failed tool executions", async () => {
    const db = createSqlite(":memory:");
    migrateSqlite(db);
    const ledger = new SqliteExecutionLedger(db);

    const entry = {
      executionId: "exec-1",
      threadId: "thread-1",
      runId: "run-1",
      taskId: "task-1",
      toolCallId: "tc-1",
      toolName: "apply_patch",
      argsJson: "{}",
      status: "planned" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await ledger.save(entry);
    const saved = await ledger.get("exec-1");
    expect(saved?.status).toBe("planned");

    await ledger.save({ ...entry, status: "started", updatedAt: new Date().toISOString() });
    const started = await ledger.get("exec-1");
    expect(started?.status).toBe("started");

    await ledger.save({ ...entry, status: "completed", resultJson: "{}", updatedAt: new Date().toISOString() });
    const completed = await ledger.get("exec-1");
    expect(completed?.status).toBe("completed");
    expect(completed?.runId).toBe("run-1");
    expect(completed?.resultJson).toBe("{}");
  });

  test("finds uncertain entries", async () => {
    const db = createSqlite(":memory:");
    migrateSqlite(db);
    const ledger = new SqliteExecutionLedger(db);

    await ledger.save({
      executionId: "exec-1",
      threadId: "thread-1",
      runId: "run-1",
      taskId: "task-1",
      toolCallId: "tc-1",
      toolName: "apply_patch",
      argsJson: "{}",
      status: "started" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const uncertain = await ledger.findUncertain("thread-1");
    expect(uncertain).toHaveLength(1);
    expect(uncertain[0]!.executionId).toBe("exec-1");
  });
});
