import { Database } from "bun:sqlite";

export function createSqlite(path: string): Database {
  return new Database(path, { create: true });
}
