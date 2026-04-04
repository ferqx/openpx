import type { Database } from "bun:sqlite";
import type { Thread } from "../../domain/thread";
import type {
  NarrativeState,
  RecoveryFacts,
  WorkingSetWindow,
} from "../../control/context/thread-compaction-types";
import type { ThreadStorePort } from "../ports/thread-store-port";
import { resolveSqlite } from "./sqlite-client";
import { migrateSqlite } from "./sqlite-migrator";

type ThreadRow = {
  thread_id: string;
  workspace_root: string;
  project_id: string;
  revision: number;
  status: Thread["status"];
  recommendation_reason: string | null;
  narrative_summary: string | null;
  narrative_revision: number | null;
  recovery_facts_json: string | null;
  narrative_state_json: string | null;
  working_set_window_json: string | null;
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
      `INSERT INTO threads (
         thread_id,
         workspace_root,
         project_id,
         revision,
         status,
         recommendation_reason,
         narrative_summary,
         narrative_revision,
         recovery_facts_json,
         narrative_state_json,
         working_set_window_json,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET
         workspace_root = excluded.workspace_root,
         project_id = excluded.project_id,
         revision = excluded.revision,
         status = excluded.status,
         recommendation_reason = excluded.recommendation_reason,
         narrative_summary = excluded.narrative_summary,
         narrative_revision = excluded.narrative_revision,
         recovery_facts_json = excluded.recovery_facts_json,
         narrative_state_json = excluded.narrative_state_json,
         working_set_window_json = excluded.working_set_window_json,
         updated_at = excluded.updated_at`,
      [
        thread.threadId,
        thread.workspaceRoot,
        thread.projectId,
        thread.revision,
        thread.status,
        thread.recommendationReason ?? null,
        thread.narrativeSummary ?? null,
        thread.narrativeRevision ?? 0,
        thread.recoveryFacts ? JSON.stringify(thread.recoveryFacts) : null,
        thread.narrativeState ? JSON.stringify(thread.narrativeState) : null,
        thread.workingSetWindow ? JSON.stringify(thread.workingSetWindow) : null,
        new Date().toISOString(),
      ],
    );
  }
  async get(threadId: string): Promise<Thread | undefined> {
    const row = this.db
      .query<ThreadRow, [string]>(
        `SELECT
           thread_id,
           workspace_root,
           project_id,
           revision,
           status,
           recommendation_reason,
           narrative_summary,
           narrative_revision,
           recovery_facts_json,
           narrative_state_json,
           working_set_window_json
         FROM threads
         WHERE thread_id = ?`,
      )
      .get(threadId);
    return row
      ? {
          threadId: row.thread_id,
          workspaceRoot: row.workspace_root,
          projectId: row.project_id,
          revision: row.revision,
          status: row.status,
          recommendationReason: row.recommendation_reason ?? undefined,
          narrativeSummary: row.narrative_summary ?? undefined,
          narrativeRevision: row.narrative_revision ?? 0,
          recoveryFacts: parseJsonColumn<RecoveryFacts>(row.recovery_facts_json),
          narrativeState: parseJsonColumn<NarrativeState>(row.narrative_state_json),
          workingSetWindow: parseJsonColumn<WorkingSetWindow>(row.working_set_window_json),
        }
      : undefined;
  }

  async getLatest(scope?: { workspaceRoot: string; projectId: string }): Promise<Thread | undefined> {
    let query = `
      SELECT
        thread_id,
        workspace_root,
        project_id,
        revision,
        status,
        recommendation_reason,
        narrative_summary,
        narrative_revision,
        recovery_facts_json,
        narrative_state_json,
        working_set_window_json,
        updated_at
      FROM threads
    `;
    const params: string[] = [];

    if (scope) {
      query += " WHERE workspace_root = ? AND project_id = ? ";
      params.push(scope.workspaceRoot, scope.projectId);
    }

    query += " ORDER BY COALESCE(updated_at, '') DESC, rowid DESC LIMIT 1 ";

    const row = this.db.query<ThreadRow, string[]>(query).get(...params);

    return row
      ? {
          threadId: row.thread_id,
          workspaceRoot: row.workspace_root,
          projectId: row.project_id,
          revision: row.revision,
          status: row.status,
          recommendationReason: row.recommendation_reason ?? undefined,
          narrativeSummary: row.narrative_summary ?? undefined,
          narrativeRevision: row.narrative_revision ?? 0,
          recoveryFacts: parseJsonColumn<RecoveryFacts>(row.recovery_facts_json),
          narrativeState: parseJsonColumn<NarrativeState>(row.narrative_state_json),
          workingSetWindow: parseJsonColumn<WorkingSetWindow>(row.working_set_window_json),
        }
      : undefined;
  }

  async listByScope(scope: { workspaceRoot: string; projectId: string }): Promise<Thread[]> {
    const rows = this.db
      .query<ThreadRow, [string, string]>(
        `SELECT
           thread_id,
           workspace_root,
           project_id,
           revision,
           status,
           recommendation_reason,
           narrative_summary,
           narrative_revision,
           recovery_facts_json,
           narrative_state_json,
           working_set_window_json,
           updated_at
         FROM threads
         WHERE workspace_root = ? AND project_id = ?
         ORDER BY COALESCE(updated_at, '') DESC, rowid DESC`,
      )
      .all(scope.workspaceRoot, scope.projectId);

    return rows.map((row) => ({
      threadId: row.thread_id,
      workspaceRoot: row.workspace_root,
      projectId: row.project_id,
      revision: row.revision,
      status: row.status,
      recommendationReason: row.recommendation_reason ?? undefined,
      narrativeSummary: row.narrative_summary ?? undefined,
      narrativeRevision: row.narrative_revision ?? 0,
      recoveryFacts: parseJsonColumn<RecoveryFacts>(row.recovery_facts_json),
      narrativeState: parseJsonColumn<NarrativeState>(row.narrative_state_json),
      workingSetWindow: parseJsonColumn<WorkingSetWindow>(row.working_set_window_json),
    }));
  }

  async close(): Promise<void> {
    if (this.owned) {
      this.db.close();
    }
  }
}

function parseJsonColumn<T>(value: string | null): T | undefined {
  if (value === null) {
    return undefined;
  }

  return JSON.parse(value) as T;
}
