import type { Database } from "bun:sqlite";
import type { Thread } from "../../domain/thread";
import { createSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

type ThreadRow = {
  thread_id: string;
  status: Thread["status"];
};

export class SqliteThreadStore {
  private readonly db: Database;

  constructor(path: string | Database) {
    this.db = typeof path === "string" ? createSqlite(path) : path;
    migrateSqlite(this.db);
  }

  async save(thread: Thread): Promise<void> {
    this.db.run(
      `INSERT INTO threads (thread_id, status)
       VALUES (?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET status = excluded.status`,
      thread.threadId,
      thread.status,
    );
  }

  async get(threadId: string): Promise<Thread | undefined> {
    const row = this.db.query<ThreadRow, [string]>("SELECT thread_id, status FROM threads WHERE thread_id = ?").get(threadId);
    return row ? { threadId: row.thread_id, status: row.status } : undefined;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
