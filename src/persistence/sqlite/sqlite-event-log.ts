import type { Database } from "bun:sqlite";
import type { Event } from "../../domain/event";
import type { EventLogPort } from "../ports/event-log-port";
import { resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

type EventRow = {
  event_id: string;
  thread_id: string;
  task_id: string | null;
  type: string;
  payload_json: string | null;
  created_at: string | null;
};

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
        `SELECT event_id, thread_id, task_id, type, payload_json, created_at
         FROM events
         WHERE thread_id = ?
         ORDER BY sequence ASC`,
      )
      .all(threadId);

    return rows.map(mapEventRow);
  }

  async close(): Promise<void> {
    if (this.owned) {
      this.db.close();
    }
  }
}

function mapEventRow(row: EventRow): Event {
  return {
    eventId: row.event_id,
    threadId: row.thread_id,
    taskId: row.task_id ?? undefined,
    type: row.type,
    payload: row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : undefined,
    createdAt: row.created_at ?? undefined,
  };
}
