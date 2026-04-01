import type { Database } from "bun:sqlite";
import type { Task } from "../../domain/task";
import type { TaskStorePort } from "../ports/task-store-port";
import { resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

type TaskRow = {
  task_id: string;
  thread_id: string;
  status: Task["status"];
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
      `INSERT INTO tasks (task_id, thread_id, status)
       VALUES (?, ?, ?)
       ON CONFLICT(task_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         status = excluded.status`,
      [task.taskId, task.threadId, task.status],
    );
  }

  async get(taskId: string): Promise<Task | undefined> {
    const row = this.db
      .query<TaskRow, [string]>("SELECT task_id, thread_id, status FROM tasks WHERE task_id = ?")
      .get(taskId);

    return row ? mapTaskRow(row) : undefined;
  }

  async listByThread(threadId: string): Promise<Task[]> {
    const rows = this.db
      .query<TaskRow, [string]>("SELECT task_id, thread_id, status FROM tasks WHERE thread_id = ? ORDER BY rowid ASC")
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
    status: row.status,
  };
}
