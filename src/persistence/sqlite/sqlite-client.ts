import { Database } from "bun:sqlite";

export function createSqlite(path: string): Database {
  return new Database(path, { create: true });
}

export function resolveSqlite(input: string | Database): { db: Database; owned: boolean } {
  if (typeof input === "string") {
    return { db: createSqlite(input), owned: true };
  }

  return { db: input, owned: false };
}
