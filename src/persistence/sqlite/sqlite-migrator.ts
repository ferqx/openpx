import type { Database } from "bun:sqlite";

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
}

function ensureColumn(db: Database, tableName: string, columnName: string, columnDefinition: string): void {
  const columns = db
    .query<{ name: string }, []>(`PRAGMA table_info(${tableName})`)
    .all()
    .map((column) => column.name);

  if (!columns.includes(columnName)) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}
