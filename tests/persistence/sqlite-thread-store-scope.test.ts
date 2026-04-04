import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { SqliteThreadStore } from "../../src/persistence/sqlite/sqlite-thread-store";
import { createThread } from "../../src/domain/thread";
import { Database } from "bun:sqlite";

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

  test("persists workspaceRoot, projectId, revision, and blocked status for a thread", async () => {
    const thread = {
      ...createThread("thread-1"),
      workspaceRoot: "/path/to/workspace",
      projectId: "project-1",
      revision: 1,
      status: "blocked" as const,
    };

    await store.save(thread);

    const reloaded = await store.get("thread-1");
    expect(reloaded).toBeDefined();
    expect(reloaded?.workspaceRoot).toBe("/path/to/workspace");
    expect(reloaded?.projectId).toBe("project-1");
    expect(reloaded?.revision).toBe(1);
    expect(reloaded?.status).toBe("blocked");
  });

  test("increments revision on save", async () => {
    const thread = {
      ...createThread("thread-1"),
      workspaceRoot: "/path/to/workspace",
      projectId: "project-1",
      revision: 1,
    };

    await store.save(thread);
    
    const updatedThread = { ...thread, revision: 2, status: "completed" as const };
    await store.save(updatedThread);

    const reloaded = await store.get("thread-1");
    expect(reloaded?.revision).toBe(2);
    expect(reloaded?.status).toBe("completed");
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
        blocking: {
          sourceTaskId: "task-1",
          kind: "human_recovery",
          message: "Manual recovery required.",
        },
        pendingApprovals: [],
        latestDurableAnswer: {
          answerId: "answer-1",
          summary: "Executor updated the runtime snapshot path.",
        },
        resumeAnchor: {
          lastEventSeq: 42,
          narrativeRevision: 2,
        },
      },
      narrativeState: {
        threadSummary: "Runtime snapshot migration is blocked on manual review.",
        taskSummaries: [],
        openLoops: ["Confirm the persisted delete request state."],
        notableEvents: [],
      },
      workingSetWindow: {
        messages: ["Need to confirm approval resume behavior."],
        toolResults: [],
        verifierFeedback: [],
        retrievedMemories: [],
      },
    };

    await store.save(thread);

    const reloaded = await store.get(thread.threadId);
    expect((reloaded as any)?.recoveryFacts?.blocking?.kind).toBe("human_recovery");
    expect((reloaded as any)?.narrativeState?.threadSummary).toContain("blocked");
    expect((reloaded as any)?.workingSetWindow?.messages).toHaveLength(1);
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
