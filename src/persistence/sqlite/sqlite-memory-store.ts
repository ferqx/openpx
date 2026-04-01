import type { Database } from "bun:sqlite";
import type { MemoryEntry, MemoryNamespace, MemorySearchInput, MemoryStorePort } from "../ports/memory-store-port";
import { createSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

type MemoryRow = {
  namespace_json: string;
  entry_key: string;
  value_json: string;
};

export class SqliteMemoryStore implements MemoryStorePort {
  private readonly db: Database;

  constructor(path: string | Database) {
    this.db = typeof path === "string" ? createSqlite(path) : path;
    migrateSqlite(this.db);
  }

  async put(namespace: MemoryNamespace, key: string, value: unknown): Promise<void> {
    const namespaceKey = encodeNamespace(namespace);
    const namespaceJson = JSON.stringify([...namespace]);
    const valueJson = JSON.stringify(value);
    const searchText = valueJson.toLowerCase();

    this.db.run(
      `INSERT INTO memories (namespace_key, namespace_json, entry_key, value_json, search_text)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(namespace_key, entry_key) DO UPDATE SET
         namespace_json = excluded.namespace_json,
         value_json = excluded.value_json,
         search_text = excluded.search_text`,
      namespaceKey,
      namespaceJson,
      key,
      valueJson,
      searchText,
    );
  }

  async get(namespace: MemoryNamespace, key: string): Promise<MemoryEntry | undefined> {
    const row = this.db
      .query<MemoryRow, [string, string]>(
        "SELECT namespace_json, entry_key, value_json FROM memories WHERE namespace_key = ? AND entry_key = ?",
      )
      .get(encodeNamespace(namespace), key);

    return row ? mapMemoryRow(row) : undefined;
  }

  async search(namespace: MemoryNamespace, input: MemorySearchInput): Promise<MemoryEntry[]> {
    const rows = this.db
      .query<MemoryRow, [string, string, number]>(
        `SELECT namespace_json, entry_key, value_json
         FROM memories
         WHERE namespace_key = ?
           AND (? = '' OR search_text LIKE ?)
         ORDER BY entry_key ASC
         LIMIT ?`,
      )
      .all(
        encodeNamespace(namespace),
        (input.query ?? "").trim(),
        `%${(input.query ?? "").trim().toLowerCase()}%`,
        input.limit,
      );

    return rows.map(mapMemoryRow);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

function encodeNamespace(namespace: MemoryNamespace): string {
  return JSON.stringify([...namespace]);
}

function mapMemoryRow(row: MemoryRow): MemoryEntry {
  return {
    namespace: JSON.parse(row.namespace_json) as string[],
    key: row.entry_key,
    value: JSON.parse(row.value_json) as unknown,
  };
}
