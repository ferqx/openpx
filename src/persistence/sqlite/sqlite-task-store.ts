import type { Database } from "bun:sqlite";
import type { Task } from "../../domain/task";
import type { TaskStorePort } from "../ports/task-store-port";
import { closeSqliteHandle, resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

/** tasks 表行结构：blockingReason 以 JSON 列持久化 */
type TaskRow = {
  task_id: string;
  thread_id: string;
  run_id: string | null;
  summary: string | null;
  status: Task["status"];
  blocking_reason_json: string | null;
};

/** SQLite task 存储：保存 task 主字段与阻塞原因 */
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
    // task 是 run/view 投影的关键索引，保存时直接 upsert 全量字段。
    this.db.run(
      `INSERT INTO tasks (task_id, thread_id, run_id, summary, status, blocking_reason_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(task_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         run_id = excluded.run_id,
         summary = excluded.summary,
         status = excluded.status,
         blocking_reason_json = excluded.blocking_reason_json`,
      [
        task.taskId,
        task.threadId,
        task.runId,
        task.summary ?? null,
        task.status,
        task.blockingReason ? JSON.stringify(task.blockingReason) : null,
      ],
    );
  }

  async get(taskId: string): Promise<Task | undefined> {
    const row = this.db
      .query<TaskRow, [string]>(
        "SELECT task_id, thread_id, run_id, summary, status, blocking_reason_json FROM tasks WHERE task_id = ?",
      )
      .get(taskId);

    return row ? mapTaskRow(row) : undefined;
  }

  async listByThread(threadId: string): Promise<Task[]> {
    const rows = this.db
      .query<TaskRow, [string]>(
        "SELECT task_id, thread_id, run_id, summary, status, blocking_reason_json FROM tasks WHERE thread_id = ? ORDER BY rowid ASC",
      )
      .all(threadId);

    // task 列表保留创建顺序，方便上层把最后一个视为当前 task。
    return rows.map(mapTaskRow);
  }

  async close(): Promise<void> {
    if (this.owned) {
      closeSqliteHandle(this.db);
    }
  }
}

/** 把 sqlite 行恢复成领域 Task */
function mapTaskRow(row: TaskRow): Task {
  return {
    taskId: row.task_id,
    threadId: row.thread_id,
    runId: row.run_id ?? row.task_id,
    summary: row.summary ?? undefined,
    status: row.status,
    blockingReason: row.blocking_reason_json ? JSON.parse(row.blocking_reason_json) : undefined,
  };
}
