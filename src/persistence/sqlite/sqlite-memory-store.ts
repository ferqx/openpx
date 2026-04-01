import type { Database } from "bun:sqlite";
import type { MemoryNamespace, MemoryRecord } from "../../domain/memory";
import type { MemorySearchInput, MemoryStorePort } from "../ports/memory-store-port";
import { createSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

type MemoryRow = {
  memory_id: string;
  namespace: MemoryNamespace;
  entry_key: string;
  value: string;
  thread_id: string;
  created_at: string;
};

export class SqliteMemoryStore implements MemoryStorePort {
  private readonly db: Database;

  constructor(path: string | Database) {
    this.db = typeof path === "string" ? createSqlite(path) : path;
    migrateSqlite(this.db);
  }

  async save(record: MemoryRecord): Promise<void> {
    const createdAt = record.createdAt ?? new Date().toISOString();

    this.db.run(
      `INSERT INTO memories (memory_id, namespace, entry_key, value, thread_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(memory_id) DO UPDATE SET
         namespace = excluded.namespace,
         entry_key = excluded.entry_key,
         value = excluded.value,
         thread_id = excluded.thread_id,
         created_at = excluded.created_at`,
      [record.memoryId, record.namespace, record.key, record.value, record.threadId, createdAt],
    );
  }

  async get(memoryId: string): Promise<MemoryRecord | undefined> {
    const row = this.db
      .query<MemoryRow, [string]>(
        "SELECT memory_id, namespace, entry_key, value, thread_id, created_at FROM memories WHERE memory_id = ?",
      )
      .get(memoryId);

    return row ? mapMemoryRow(row) : undefined;
  }

  async search(namespace: MemoryNamespace, input: MemorySearchInput): Promise<MemoryRecord[]> {
    const query = (input.query ?? "").trim().toLowerCase();
    const threadId = input.threadId ?? "";
    const rows = this.db
      .query<MemoryRow, [MemoryNamespace, string, string, string, string, number]>(
        `SELECT memory_id, namespace, entry_key, value, thread_id, created_at
         FROM memories
         WHERE namespace = ?
           AND (? = '' OR lower(value) LIKE ?)
           AND (? = '' OR thread_id = ?)
         ORDER BY entry_key ASC
         LIMIT ?`,
      )
      .all(namespace, query, `%${query}%`, threadId, threadId, input.limit);

    return rows.map(mapMemoryRow);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

function mapMemoryRow(row: MemoryRow): MemoryRecord {
  return {
    memoryId: row.memory_id,
    namespace: row.namespace,
    key: row.entry_key,
    value: row.value,
    threadId: row.thread_id,
    createdAt: row.created_at,
  };
}
