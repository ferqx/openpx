import type { Database } from "bun:sqlite";
import type { Worker } from "../../domain/worker";
import type { WorkerStorePort } from "../ports/worker-store-port";
import { closeSqliteHandle, resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

/** workers 表行结构 */
type WorkerRow = {
  worker_id: string;
  thread_id: string;
  task_id: string;
  role: Worker["role"];
  status: Worker["status"];
  spawn_reason: string;
  started_at: string | null;
  ended_at: string | null;
  resume_token: string | null;
};

/** 被视为活跃的 worker 状态集合 */
const ACTIVE_WORKER_STATUSES: Worker["status"][] = ["created", "starting", "running", "paused"];

/** SQLite worker 存储：保存 worker 生命周期并支持按线程查询活跃 worker */
export class SqliteWorkerStore implements WorkerStorePort {
  private readonly db: Database;
  private readonly owned: boolean;

  constructor(path: string | Database) {
    const connection = resolveSqlite(path);
    this.db = connection.db;
    this.owned = connection.owned;
    migrateSqlite(this.db);
  }

  async save(worker: Worker): Promise<void> {
    this.db.run(
      `INSERT INTO workers (
        worker_id, thread_id, task_id, role, status, spawn_reason, started_at, ended_at, resume_token
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(worker_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         task_id = excluded.task_id,
         role = excluded.role,
         status = excluded.status,
         spawn_reason = excluded.spawn_reason,
         started_at = excluded.started_at,
         ended_at = excluded.ended_at,
         resume_token = excluded.resume_token`,
      [
        worker.workerId,
        worker.threadId,
        worker.taskId,
        worker.role,
        worker.status,
        worker.spawnReason,
        worker.startedAt ?? null,
        worker.endedAt ?? null,
        worker.resumeToken ?? null,
      ],
    );
  }

  async get(workerId: string): Promise<Worker | undefined> {
    const row = this.db
      .query<WorkerRow, [string]>(
        `SELECT worker_id, thread_id, task_id, role, status, spawn_reason, started_at, ended_at, resume_token
         FROM workers WHERE worker_id = ?`,
      )
      .get(workerId);

    return row ? mapWorkerRow(row) : undefined;
  }

  async listByThread(threadId: string): Promise<Worker[]> {
    const rows = this.db
      .query<WorkerRow, [string]>(
        `SELECT worker_id, thread_id, task_id, role, status, spawn_reason, started_at, ended_at, resume_token
         FROM workers WHERE thread_id = ? ORDER BY rowid ASC`,
      )
      .all(threadId);

    return rows.map(mapWorkerRow);
  }

  async listActiveByThread(threadId: string): Promise<Worker[]> {
    const placeholders = ACTIVE_WORKER_STATUSES.map(() => "?").join(", ");
    const rows = this.db
      .query<WorkerRow, [string, ...Worker["status"][]]>(
        `SELECT worker_id, thread_id, task_id, role, status, spawn_reason, started_at, ended_at, resume_token
         FROM workers
         WHERE thread_id = ? AND status IN (${placeholders})
         ORDER BY rowid ASC`,
      )
      .all(threadId, ...ACTIVE_WORKER_STATUSES);

    return rows.map(mapWorkerRow);
  }

  async close(): Promise<void> {
    if (this.owned) {
      closeSqliteHandle(this.db);
    }
  }
}

/** 把 sqlite 行恢复成领域 Worker */
function mapWorkerRow(row: WorkerRow): Worker {
  return {
    workerId: row.worker_id,
    threadId: row.thread_id,
    taskId: row.task_id,
    role: row.role,
    status: row.status,
    spawnReason: row.spawn_reason,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    resumeToken: row.resume_token ?? undefined,
  };
}
