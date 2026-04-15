import type { Database } from "bun:sqlite";
import type { Event } from "../../domain/event";
import type { EventLogPort } from "../ports/event-log-port";
import { closeSqliteHandle, resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

/** events 表行结构：sequence 由 sqlite 自增生成，payload 走 JSON 列 */
type EventRow = {
  sequence: number;
  event_id: string;
  thread_id: string;
  task_id: string | null;
  type: string;
  payload_json: string | null;
  created_at: string | null;
};

/** SQLite 事件日志：保存 durable event，供 hydrate/replay/runtime event stream 使用 */
export class SqliteEventLog implements EventLogPort {
  private readonly db: Database;
  private readonly owned: boolean;

  constructor(path: string | Database) {
    const connection = resolveSqlite(path);
    this.db = connection.db;
    this.owned = connection.owned;
    migrateSqlite(this.db);
  }

  async append(event: Event): Promise<void> {
    // sequence 不由调用方提供，而由数据库按插入顺序生成，确保回放有序。
    this.db.run(
      `INSERT INTO events (event_id, thread_id, task_id, type, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        event.eventId,
        event.threadId,
        event.taskId ?? null,
        event.type,
        event.payload ? JSON.stringify(event.payload) : null,
        event.createdAt ?? null,
      ],
    );
  }

  async listByThread(threadId: string): Promise<Event[]> {
    const rows = this.db
      .query<EventRow, [string]>(
        `SELECT sequence, event_id, thread_id, task_id, type, payload_json, created_at
         FROM events
         WHERE thread_id = ?
         ORDER BY sequence ASC`,
      )
      .all(threadId);

    return rows.map(mapEventRow);
  }

  async listByThreadAfter(threadId: string, seq: number): Promise<Event[]> {
    const rows = this.db
      .query<EventRow, [string, number]>(
        `SELECT sequence, event_id, thread_id, task_id, type, payload_json, created_at
         FROM events
         WHERE thread_id = ? AND sequence > ?
         ORDER BY sequence ASC`,
      )
      .all(threadId, seq);

    return rows.map(mapEventRow);
  }

  async close(): Promise<void> {
    if (this.owned) {
      closeSqliteHandle(this.db);
    }
  }
}

/** 把 sqlite 行恢复成带 sequence 的 durable Event */
function mapEventRow(row: EventRow): Event {
  return {
    sequence: row.sequence,
    eventId: row.event_id,
    threadId: row.thread_id,
    taskId: row.task_id ?? undefined,
    type: row.type,
    payload: row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : undefined,
    createdAt: row.created_at ?? undefined,
  } as Event;
}
