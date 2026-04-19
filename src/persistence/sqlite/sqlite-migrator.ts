import type { Database } from "bun:sqlite";

/** 统一执行 sqlite schema 迁移与列补齐 */
export function migrateSqlite(db: Database): void {
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      run_id TEXT,
      summary TEXT,
      status TEXT NOT NULL,
      blocking_reason_json TEXT
    )
  `);

  ensureColumn(db, "tasks", "summary", "TEXT");
  ensureColumn(db, "tasks", "run_id", "TEXT");
  ensureColumn(db, "tasks", "blocking_reason_json", "TEXT");

  db.run(`
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      status TEXT NOT NULL,
      trigger TEXT NOT NULL,
      input_text TEXT,
      active_task_id TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      result_summary TEXT,
      resume_token TEXT,
      blocking_reason_json TEXT
    )
  `);

  ensureColumn(db, "runs", "input_text", "TEXT");
  ensureColumn(db, "runs", "active_task_id", "TEXT");
  ensureColumn(db, "runs", "ended_at", "TEXT");
  ensureColumn(db, "runs", "result_summary", "TEXT");
  ensureColumn(db, "runs", "resume_token", "TEXT");
  ensureColumn(db, "runs", "blocking_reason_json", "TEXT");
  ensureColumn(db, "runs", "ledger_state_json", "TEXT");

  db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      memory_id TEXT PRIMARY KEY,
      namespace TEXT NOT NULL,
      entry_key TEXT NOT NULL,
      value TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      thread_id TEXT NOT NULL,
      task_id TEXT,
      type TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS threads (
      thread_id TEXT PRIMARY KEY,
      workspace_root TEXT,
      project_id TEXT,
      revision INTEGER DEFAULT 1,
      status TEXT NOT NULL,
      thread_mode TEXT DEFAULT 'normal',
      updated_at TEXT,
      recommendation_reason TEXT,
      narrative_summary TEXT,
      narrative_revision INTEGER DEFAULT 0,
      recovery_facts_json TEXT,
      narrative_state_json TEXT,
      working_set_window_json TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS approvals (
      approval_request_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      run_id TEXT,
      task_id TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      request_json TEXT,
      summary TEXT NOT NULL,
      risk TEXT NOT NULL,
      status TEXT NOT NULL
    )
  `);

  ensureColumn(db, "threads", "updated_at", "TEXT");
  ensureColumn(db, "threads", "workspace_root", "TEXT");
  ensureColumn(db, "threads", "project_id", "TEXT");
  ensureColumn(db, "threads", "revision", "INTEGER DEFAULT 1");
  ensureColumn(db, "threads", "thread_mode", "TEXT DEFAULT 'normal'");
  ensureColumn(db, "threads", "recommendation_reason", "TEXT");
  ensureColumn(db, "threads", "narrative_summary", "TEXT");
  ensureColumn(db, "threads", "narrative_revision", "INTEGER DEFAULT 0");
  ensureColumn(db, "threads", "recovery_facts_json", "TEXT");
  ensureColumn(db, "threads", "narrative_state_json", "TEXT");
  ensureColumn(db, "threads", "working_set_window_json", "TEXT");
  ensureColumn(db, "approvals", "request_json", "TEXT");
  ensureColumn(db, "approvals", "run_id", "TEXT");

  db.run(`
    CREATE TABLE IF NOT EXISTS workers (
      worker_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      spawn_reason TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT,
      resume_token TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS execution_ledger (
      execution_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      run_id TEXT,
      task_id TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      args_json TEXT NOT NULL,
      status TEXT NOT NULL,
      result_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  ensureColumn(db, "execution_ledger", "run_id", "TEXT");

  db.run("CREATE INDEX IF NOT EXISTS idx_tasks_thread_id ON tasks (thread_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_runs_thread_id ON runs (thread_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_memories_namespace ON memories (namespace)");
  db.run("CREATE INDEX IF NOT EXISTS idx_memories_thread_id ON memories (thread_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_events_thread_sequence ON events (thread_id, sequence)");
  db.run("CREATE INDEX IF NOT EXISTS idx_approvals_thread_id ON approvals (thread_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_workers_thread_id ON workers (thread_id)");

  db.run(`
    CREATE TABLE IF NOT EXISTS run_loop_states (
      run_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      task_id TEXT,
      step TEXT NOT NULL,
      state_version INTEGER NOT NULL DEFAULT 1,
      engine_version TEXT NOT NULL DEFAULT 'run-loop-v1',
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  ensureColumn(db, "run_loop_states", "state_version", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "run_loop_states", "engine_version", "TEXT NOT NULL DEFAULT 'run-loop-v1'");

  db.run(`
    CREATE TABLE IF NOT EXISTS run_suspensions (
      suspension_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      approval_request_id TEXT,
      reason_kind TEXT NOT NULL,
      resume_step TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resumed_at TEXT,
      resolved_at TEXT,
      resolved_by_continuation_id TEXT,
      invalidated_at TEXT,
      invalidation_reason TEXT
    )
  `);
  ensureColumn(db, "run_suspensions", "status", "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn(db, "run_suspensions", "resolved_at", "TEXT");
  ensureColumn(db, "run_suspensions", "resolved_by_continuation_id", "TEXT");
  ensureColumn(db, "run_suspensions", "invalidated_at", "TEXT");
  ensureColumn(db, "run_suspensions", "invalidation_reason", "TEXT");

  db.run(`
    CREATE TABLE IF NOT EXISTS run_continuations (
      continuation_id TEXT PRIMARY KEY,
      thread_id TEXT,
      run_id TEXT,
      task_id TEXT,
      approval_request_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'created',
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      consumed_at TEXT,
      invalidated_at TEXT,
      invalidation_reason TEXT
    )
  `);
  ensureColumn(db, "run_continuations", "task_id", "TEXT");
  ensureColumn(db, "run_continuations", "approval_request_id", "TEXT");
  ensureColumn(db, "run_continuations", "status", "TEXT NOT NULL DEFAULT 'created'");
  ensureColumn(db, "run_continuations", "consumed_at", "TEXT");
  ensureColumn(db, "run_continuations", "invalidated_at", "TEXT");
  ensureColumn(db, "run_continuations", "invalidation_reason", "TEXT");

  db.run(`
    CREATE TABLE IF NOT EXISTS system_migrations (
      migration_key TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_run_loop_states_thread_id ON run_loop_states (thread_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_run_suspensions_thread_id ON run_suspensions (thread_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_run_continuations_thread_id ON run_continuations (thread_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_run_suspensions_run_status ON run_suspensions (run_id, status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_run_suspensions_approval_status ON run_suspensions (approval_request_id, status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_run_continuations_run_status ON run_continuations (run_id, status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_run_continuations_thread_status ON run_continuations (thread_id, status)");
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_run_suspensions_one_active_per_run
    ON run_suspensions (run_id)
    WHERE status = 'active'
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS eval_suite_runs (
      suite_run_id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS eval_scenario_results (
      scenario_run_id TEXT PRIMARY KEY,
      suite_run_id TEXT,
      scenario_id TEXT NOT NULL,
      scenario_version INTEGER NOT NULL,
      family TEXT NOT NULL,
      status TEXT NOT NULL,
      thread_id TEXT,
      primary_run_id TEXT,
      primary_task_id TEXT,
      comparable_json TEXT NOT NULL,
      outcome_results_json TEXT NOT NULL,
      trajectory_results_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS eval_review_queue (
      review_item_id TEXT PRIMARY KEY,
      scenario_run_id TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      severity TEXT NOT NULL,
      triage_status TEXT NOT NULL DEFAULT 'open',
      resolution_type TEXT,
      summary TEXT NOT NULL,
      object_refs_json TEXT NOT NULL,
      owner_note TEXT,
      follow_up_json TEXT,
      created_at TEXT NOT NULL,
      closed_at TEXT
    )
  `);
  ensureColumn(db, "eval_review_queue", "triage_status", "TEXT NOT NULL DEFAULT 'open'");
  ensureColumn(db, "eval_review_queue", "resolution_type", "TEXT");
  ensureColumn(db, "eval_review_queue", "owner_note", "TEXT");
  ensureColumn(db, "eval_review_queue", "follow_up_json", "TEXT");
  ensureColumn(db, "eval_review_queue", "metadata_json", "TEXT");
  ensureColumn(db, "eval_review_queue", "closed_at", "TEXT");
  migrateLegacyEvalReviewQueueStatus(db);

  db.run("CREATE INDEX IF NOT EXISTS idx_eval_scenario_results_suite_run_id ON eval_scenario_results (suite_run_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_eval_review_queue_scenario_run_id ON eval_review_queue (scenario_run_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_eval_review_queue_triage_status ON eval_review_queue (triage_status)");
}

/** 确保指定表存在某列；缺失时执行 ALTER TABLE 补齐 */
function ensureColumn(db: Database, tableName: string, columnName: string, columnDefinition: string): void {
  const columns = db
    .query<{ name: string }, []>(`PRAGMA table_info(${tableName})`)
    .all()
    .map((column) => column.name);

  if (!columns.includes(columnName)) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

/** 把旧的 status 列数据迁移到新的 triage_status 列 */
function migrateLegacyEvalReviewQueueStatus(db: Database): void {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(eval_review_queue)")
    .all()
    .map((column) => column.name);

  if (!columns.includes("status")) {
    return;
  }

  db.run(`
    UPDATE eval_review_queue
    SET triage_status = CASE
      WHEN triage_status IS NULL OR triage_status = '' THEN status
      ELSE triage_status
    END
  `);
}
