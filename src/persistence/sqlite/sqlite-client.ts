import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";

export function createSqlite(path: string): Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  return new Database(path, { create: true });
}

export function resolveSqlite(input: string | Database): { db: Database; owned: boolean } {
  if (typeof input === "string") {
    return { db: createSqlite(input), owned: true };
  }

  return { db: input, owned: false };
}
