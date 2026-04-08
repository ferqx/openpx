import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { SqliteThreadStore } from "../../src/persistence/sqlite/sqlite-thread-store";
import { createThread } from "../../src/domain/thread";
import { Database } from "bun:sqlite";
import { migrateSqlite } from "../../src/persistence/sqlite/sqlite-migrator";

describe("SqliteThreadStore Scope", () => {
  let store: SqliteThreadStore;
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    store = new SqliteThreadStore(db);
  });

  afterEach(async () => {
    await store.close();
  });

  test("persists workspaceRoot, projectId, revision, and idle status for a thread", async () => {
    const thread = {
      ...createThread("thread-1"),
      workspaceRoot: "/path/to/workspace",
      projectId: "project-1",
      revision: 1,
      status: "idle" as const,
    };

    await store.save(thread);

    const reloaded = await store.get("thread-1");
    expect(reloaded).toBeDefined();
    expect(reloaded?.workspaceRoot).toBe("/path/to/workspace");
    expect(reloaded?.projectId).toBe("project-1");
    expect(reloaded?.revision).toBe(1);
    expect(reloaded?.status).toBe("idle");
  });

  test("increments revision on save", async () => {
    const thread = {
      ...createThread("thread-1"),
      workspaceRoot: "/path/to/workspace",
      projectId: "project-1",
      revision: 1,
    };

    await store.save(thread);
    
    const updatedThread = { ...thread, revision: 2, status: "archived" as const };
    await store.save(updatedThread);

    const reloaded = await store.get("thread-1");
    expect(reloaded?.revision).toBe(2);
    expect(reloaded?.status).toBe("archived");
  });

  test("persists thread narrative summary and revision", async () => {
    const thread = {
      ...createThread("thread-narrative"),
      workspaceRoot: "/path/to/workspace",
      projectId: "project-1",
      revision: 1,
      narrativeSummary: "Completed repo scan and isolated runtime recovery work.",
      narrativeRevision: 3,
    };

    await store.save(thread);

    const reloaded = await store.get("thread-narrative");
    expect(reloaded?.narrativeSummary).toBe("Completed repo scan and isolated runtime recovery work.");
    expect(reloaded?.narrativeRevision).toBe(3);
  });

  test("persists recovery facts, narrative state, and working set window on the thread record", async () => {
    const thread = {
      ...createThread("thread-compaction"),
      workspaceRoot: "/repo",
      projectId: "openwenpx",
      recoveryFacts: {
        threadId: "thread-compaction",
        revision: 1,
        schemaVersion: 1,
        status: "active",
        updatedAt: new Date().toISOString(),
        blocking: {
          sourceTaskId: "task-1",
          kind: "human_recovery" as const,
          message: "Manual recovery required.",
        },
        pendingApprovals: [],
        latestDurableAnswer: {
          answerId: "answer-1",
          summary: "Executor updated the runtime snapshot path.",
          createdAt: new Date().toISOString(),
        },
        resumeAnchor: {
          lastEventSeq: 42,
          narrativeRevision: 2,
        },
      },
      narrativeState: {
        revision: 1,
        updatedAt: new Date().toISOString(),
        threadSummary: "Runtime snapshot migration is blocked on manual review.",
        taskSummaries: [],
        openLoops: ["Confirm the persisted delete request state."],
        notableEvents: [],
      },
      workingSetWindow: {
        revision: 1,
        updatedAt: new Date().toISOString(),
        messages: ["Need to confirm approval resume behavior."],
        toolResults: [],
        verifierFeedback: [],
        retrievedMemories: [],
      },
    };

    await store.save(thread);

    const reloaded = await store.get(thread.threadId);
    expect(reloaded?.recoveryFacts?.blocking?.kind).toBe("human_recovery");
    expect(reloaded?.narrativeState?.threadSummary).toContain("blocked");
    expect(reloaded?.workingSetWindow?.messages).toHaveLength(1);
  });

  test("migrates an existing threads table without losing rows and can round-trip derived thread state", async () => {
    const legacyDb = new Database(":memory:");
    legacyDb.run(`
      CREATE TABLE threads (
        thread_id TEXT PRIMARY KEY,
        workspace_root TEXT,
        project_id TEXT,
        revision INTEGER DEFAULT 1,
        status TEXT NOT NULL,
        updated_at TEXT,
        recommendation_reason TEXT,
        narrative_summary TEXT,
        narrative_revision INTEGER DEFAULT 0
      )
    `);
    legacyDb.run(
      `INSERT INTO threads (
         thread_id,
         workspace_root,
         project_id,
         revision,
         status,
         updated_at,
         recommendation_reason,
         narrative_summary,
         narrative_revision
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "legacy-thread",
        "/legacy/workspace",
        "legacy-project",
        3,
        "active",
        "2026-04-04T00:00:00.000Z",
        "legacy reason",
        "legacy summary",
        4,
      ],
    );

    migrateSqlite(legacyDb);

    const legacyRow = legacyDb
      .query<{ thread_id: string }, []>("SELECT thread_id FROM threads WHERE thread_id = 'legacy-thread'")
      .get();
    expect(legacyRow?.thread_id).toBe("legacy-thread");

    const legacyStore = new SqliteThreadStore(legacyDb);
    const thread = {
      ...createThread("legacy-thread"),
      workspaceRoot: "/legacy/workspace",
      projectId: "legacy-project",
      revision: 4,
      status: "idle" as const,
      recoveryFacts: {
        threadId: "legacy-thread",
        revision: 4,
        schemaVersion: 1,
        status: "blocked",
        updatedAt: new Date().toISOString(),
        pendingApprovals: [],
        blocking: {
          sourceTaskId: "task-legacy",
          kind: "waiting_approval" as const,
          message: "Awaiting approval.",
        },
      },
      narrativeState: {
        revision: 1,
        updatedAt: new Date().toISOString(),
        threadSummary: "Legacy thread summary.",
        taskSummaries: ["task summary"],
        openLoops: [],
        notableEvents: [],
      },
      workingSetWindow: {
        revision: 1,
        updatedAt: new Date().toISOString(),
        messages: ["message"],
        toolResults: [],
        verifierFeedback: [],
        retrievedMemories: [],
      },
    };

    await legacyStore.save(thread);

    const reloaded = await legacyStore.get("legacy-thread");
    expect(reloaded?.threadId).toBe("legacy-thread");
    expect(reloaded?.recoveryFacts?.blocking?.kind).toBe("waiting_approval");
    expect(reloaded?.narrativeState?.threadSummary).toBe("Legacy thread summary.");
    expect(reloaded?.workingSetWindow?.messages).toEqual(["message"]);

    await legacyStore.close();
    legacyDb.close();
  });

  test("ignores malformed derived-state JSON when reading a thread", async () => {
    const thread = {
      ...createThread("thread-malformed-json"),
      workspaceRoot: "/repo",
      projectId: "openwenpx",
      revision: 1,
      narrativeSummary: "Valid narrative summary.",
      narrativeRevision: 1,
    };

    await store.save(thread);
    db.run(
      `UPDATE threads
       SET recovery_facts_json = ?
       WHERE thread_id = ?`,
      ["{not valid json", thread.threadId],
    );

    const reloaded = await store.get(thread.threadId);
    expect(reloaded?.threadId).toBe("thread-malformed-json");
    expect(reloaded?.narrativeSummary).toBe("Valid narrative summary.");
    expect(reloaded?.recoveryFacts).toBeUndefined();
  });

  test("looks up latest thread within a specific workspace and project scope", async () => {
    const thread1 = {
      ...createThread("t1"),
      workspaceRoot: "w1",
      projectId: "p1",
      revision: 1,
    };
    const thread2 = {
      ...createThread("t2"),
      workspaceRoot: "w1",
      projectId: "p2",
      revision: 1,
    };
    const thread3 = {
      ...createThread("t3"),
      workspaceRoot: "w2",
      projectId: "p1",
      revision: 1,
    };

    await store.save(thread1);
    await store.save(thread2);
    await store.save(thread3);

    // Should find t1 for (w1, p1)
    const latest1 = await store.getLatest({ workspaceRoot: "w1", projectId: "p1" });
    expect(latest1?.threadId).toBe("t1");

    // Should find t2 for (w1, p2)
    const latest2 = await store.getLatest({ workspaceRoot: "w1", projectId: "p2" });
    expect(latest2?.threadId).toBe("t2");
  });
});
