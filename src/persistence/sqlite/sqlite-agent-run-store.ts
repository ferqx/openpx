import type { Database } from "bun:sqlite";
import type { AgentRunRecord } from "../../domain/agent-run";
import type { AgentRunStorePort } from "../ports/agent-run-store-port";
import { closeSqliteHandle, resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

/** agent_runs 表行结构。 */
type AgentRunRow = {
  agent_run_id: string;
  thread_id: string;
  task_id: string;
  role: AgentRunRecord["role"];
  status: AgentRunRecord["status"];
  spawn_reason: string;
  started_at: string | null;
  ended_at: string | null;
  resume_token: string | null;
};

/** 被视为活跃的 AgentRun 状态集合。 */
const ACTIVE_AGENT_RUN_STATUSES: AgentRunRecord["status"][] = ["created", "starting", "running", "paused"];

/** SQLite AgentRun 存储：保存运行实例生命周期并支持按线程查询活跃实例。 */
export class SqliteAgentRunStore implements AgentRunStorePort {
  private readonly db: Database;
  private readonly owned: boolean;

  constructor(path: string | Database) {
    const connection = resolveSqlite(path);
    this.db = connection.db;
    this.owned = connection.owned;
    migrateSqlite(this.db);
  }

  async save(agentRun: AgentRunRecord): Promise<void> {
    this.db.run(
      `INSERT INTO agent_runs (
        agent_run_id, thread_id, task_id, role, status, spawn_reason, started_at, ended_at, resume_token
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent_run_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         task_id = excluded.task_id,
         role = excluded.role,
         status = excluded.status,
         spawn_reason = excluded.spawn_reason,
         started_at = excluded.started_at,
         ended_at = excluded.ended_at,
         resume_token = excluded.resume_token`,
      [
        agentRun.agentRunId,
        agentRun.threadId,
        agentRun.taskId,
        agentRun.role,
        agentRun.status,
        agentRun.spawnReason,
        agentRun.startedAt ?? null,
        agentRun.endedAt ?? null,
        agentRun.resumeToken ?? null,
      ],
    );
  }

  async get(agentRunId: string): Promise<AgentRunRecord | undefined> {
    const row = this.db
      .query<AgentRunRow, [string]>(
        `SELECT agent_run_id, thread_id, task_id, role, status, spawn_reason, started_at, ended_at, resume_token
         FROM agent_runs WHERE agent_run_id = ?`,
      )
      .get(agentRunId);

    return row ? mapAgentRunRow(row) : undefined;
  }

  async listByThread(threadId: string): Promise<AgentRunRecord[]> {
    const rows = this.db
      .query<AgentRunRow, [string]>(
        `SELECT agent_run_id, thread_id, task_id, role, status, spawn_reason, started_at, ended_at, resume_token
         FROM agent_runs WHERE thread_id = ? ORDER BY rowid ASC`,
      )
      .all(threadId);

    return rows.map(mapAgentRunRow);
  }

  async listActiveByThread(threadId: string): Promise<AgentRunRecord[]> {
    const placeholders = ACTIVE_AGENT_RUN_STATUSES.map(() => "?").join(", ");
    const rows = this.db
      .query<AgentRunRow, [string, ...AgentRunRecord["status"][]]>(
        `SELECT agent_run_id, thread_id, task_id, role, status, spawn_reason, started_at, ended_at, resume_token
         FROM agent_runs
         WHERE thread_id = ? AND status IN (${placeholders})
         ORDER BY rowid ASC`,
      )
      .all(threadId, ...ACTIVE_AGENT_RUN_STATUSES);

    return rows.map(mapAgentRunRow);
  }

  async close(): Promise<void> {
    if (this.owned) {
      closeSqliteHandle(this.db);
    }
  }
}

/** 把 sqlite 行恢复成领域 AgentRunRecord。 */
function mapAgentRunRow(row: AgentRunRow): AgentRunRecord {
  return {
    agentRunId: row.agent_run_id,
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
