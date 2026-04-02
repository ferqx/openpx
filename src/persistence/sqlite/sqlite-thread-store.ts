import type { Database } from "bun:sqlite";
import type { Thread } from "../../domain/thread";
import type { ThreadStorePort } from "../ports/thread-store-port";
import { resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

type ThreadRow = {
  thread_id: string;
  status: Thread["status"];
  updated_at: string | null;
};

export class SqliteThreadStore implements ThreadStorePort {
  private readonly db: Database;
  private readonly owned: boolean;

  constructor(path: string | Database) {
    const connection = resolveSqlite(path);
    this.db = connection.db;
    this.owned = connection.owned;
    migrateSqlite(this.db);
  }

  async save(thread: Thread): Promise<void> {
    this.db.run(
      `INSERT INTO threads (thread_id, status, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
      [thread.threadId, thread.status, new Date().toISOString()],
    );
  }

  async get(threadId: string): Promise<Thread | undefined> {
    const row = this.db
      .query<ThreadRow, [string]>("SELECT thread_id, status, updated_at FROM threads WHERE thread_id = ?")
      .get(threadId);
    return row ? { threadId: row.thread_id, status: row.status } : undefined;
  }

  async getLatest(): Promise<Thread | undefined> {
    const row = this.db
      .query<ThreadRow, []>(
        `SELECT thread_id, status, updated_at
         FROM threads
         ORDER BY COALESCE(updated_at, '') DESC, rowid DESC
         LIMIT 1`,
      )
      .get();

    return row ? { threadId: row.thread_id, status: row.status } : undefined;
  }

  async close(): Promise<void> {
    if (this.owned) {
      this.db.close();
    }
  }
}
