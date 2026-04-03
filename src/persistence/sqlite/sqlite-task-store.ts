import type { Database } from "bun:sqlite";
import type { Task } from "../../domain/task";
import type { TaskStorePort } from "../ports/task-store-port";
import { resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

type TaskRow = {
  task_id: string;
  thread_id: string;
  summary: string | null;
  status: Task["status"];
  blocking_reason_json: string | null;
};

export class SqliteTaskStore implements TaskStorePort {
  private readonly db: Database;
  private readonly owned: boolean;

  constructor(path: string | Database) {
    const connection = resolveSqlite(path);
    this.db = connection.db;
    this.owned = connection.owned;
    migrateSqlite(this.db);
  }

  async save(task: Task): Promise<void> {
    this.db.run(
      `INSERT INTO tasks (task_id, thread_id, summary, status, blocking_reason_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(task_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         summary = excluded.summary,
         status = excluded.status,
         blocking_reason_json = excluded.blocking_reason_json`,
      [
        task.taskId,
        task.threadId,
        task.summary ?? null,
        task.status,
        task.blockingReason ? JSON.stringify(task.blockingReason) : null,
      ],
    );
  }

  async get(taskId: string): Promise<Task | undefined> {
    const row = this.db
      .query<TaskRow, [string]>(
        "SELECT task_id, thread_id, summary, status, blocking_reason_json FROM tasks WHERE task_id = ?",
      )
      .get(taskId);

    return row ? mapTaskRow(row) : undefined;
  }

  async listByThread(threadId: string): Promise<Task[]> {
    const rows = this.db
      .query<TaskRow, [string]>(
        "SELECT task_id, thread_id, summary, status, blocking_reason_json FROM tasks WHERE thread_id = ? ORDER BY rowid ASC",
      )
      .all(threadId);

    return rows.map(mapTaskRow);
  }

  async close(): Promise<void> {
    if (this.owned) {
      this.db.close();
    }
  }
}

function mapTaskRow(row: TaskRow): Task {
  return {
    taskId: row.task_id,
    threadId: row.thread_id,
    summary: row.summary ?? undefined,
    status: row.status,
    blockingReason: row.blocking_reason_json ? JSON.parse(row.blocking_reason_json) : undefined,
  };
}
