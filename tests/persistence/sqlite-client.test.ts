import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createSqlite } from "../../src/persistence/sqlite/sqlite-client";

describe("createSqlite", () => {
  test("creates parent directories for file-backed databases", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "openwenpx-sqlite-client-"));
    const dbPath = join(workspace, ".openwenpx", "agent.sqlite");

    const db = createSqlite(dbPath);
    try {
      await access(join(workspace, ".openwenpx"));
    } finally {
      db.close();
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
