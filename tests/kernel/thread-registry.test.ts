import { describe, expect, test } from "bun:test";
import { ThreadRegistry } from "../../src/harness/core/thread/thread-registry";
import { SqliteThreadStore } from "../../src/persistence/sqlite/sqlite-thread-store";
import { createSqlite } from "../../src/persistence/sqlite/sqlite-client";
import { migrateSqlite } from "../../src/persistence/sqlite/sqlite-migrator";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

describe("ThreadRegistry", () => {
  test("resolves active thread and creates one if missing", async () => {
    const db = createSqlite(":memory:");
    migrateSqlite(db);
    const store = new SqliteThreadStore(db);
    const registry = new ThreadRegistry(store);

    const scope = { workspaceRoot: "/tmp/w1", projectId: "p1" };
    const thread = await registry.resolveActiveThread(scope);

    expect(thread.workspaceRoot).toBe(scope.workspaceRoot);
    expect(thread.projectId).toBe(scope.projectId);
    expect(thread.status).toBe("active");

    const resolved = await registry.resolveActiveThread(scope);
    expect(resolved.threadId).toBe(thread.threadId);
  });

  test("creates a new thread even if one exists in another scope", async () => {
    const db = createSqlite(":memory:");
    migrateSqlite(db);
    const store = new SqliteThreadStore(db);
    const registry = new ThreadRegistry(store);

    const s1 = { workspaceRoot: "/tmp/w1", projectId: "p1" };
    const s2 = { workspaceRoot: "/tmp/w2", projectId: "p2" };

    const t1 = await registry.createThread(s1);
    // Ensure different timestamp
    await new Promise(r => setTimeout(r, 2));
    const t2 = await registry.createThread(s2);

    expect(t1.threadId).not.toBe(t2.threadId);
    expect(t1.workspaceRoot).toBe(s1.workspaceRoot);
    expect(t2.workspaceRoot).toBe(s2.workspaceRoot);
  });
});
