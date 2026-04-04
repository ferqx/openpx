import { describe, expect, test } from "bun:test";
import { createThreadNarrativeService } from "../../src/control/context/thread-narrative-service";
import { createControlTask } from "../../src/control/tasks/task-types";
import { createThread } from "../../src/domain/thread";

describe("ThreadNarrativeService", () => {
  test("promotes only stable task outputs into thread narrative state", async () => {
    const narrativeService = createThreadNarrativeService();
    const threadId = "thread-1";

    const completedTask = createControlTask({
      taskId: "task-1",
      threadId,
      summary: "User successfully authenticated",
      status: "completed",
    });

    const runningTask = createControlTask({
      taskId: "task-2",
      threadId,
      summary: "Attempting to connect to database...",
      status: "running",
    });

    await narrativeService.processTaskUpdate(completedTask);
    await narrativeService.processTaskUpdate(runningTask);

    const narrative = await narrativeService.getNarrative(threadId);
    expect(narrative.events.some(e => e.summary === "User successfully authenticated")).toBe(true);
    expect(narrative.events.some(e => e.summary === "Attempting to connect to database...")).toBe(false);
    expect(narrative.summary).toBe("User successfully authenticated");
  });

  test("maintains a curated history of stable task outcomes", async () => {
    const narrativeService = createThreadNarrativeService();
    const threadId = "thread-1";

    await narrativeService.processTaskUpdate(createControlTask({
      taskId: "task-1",
      threadId,
      summary: "Step 1: Done",
      status: "completed",
    }));

    await narrativeService.processTaskUpdate(createControlTask({
      taskId: "task-2",
      threadId,
      summary: "Step 2: Done",
      status: "completed",
    }));

    const narrative = await narrativeService.getNarrative(threadId);
    expect(narrative.events).toHaveLength(2);
    expect(narrative.events[0]!.summary).toBe("Step 1: Done");
    expect(narrative.events[1]!.summary).toBe("Step 2: Done");
    expect(narrative.summary).toBe("Step 1: Done; Step 2: Done");
  });

  test("persists narrative state through the thread store when configured", async () => {
    const threads = new Map<string, ReturnType<typeof createThread>>();
    const baseThread = createThread("thread-1", "/workspace", "project-1");
    threads.set(baseThread.threadId, baseThread);

    const narrativeService = createThreadNarrativeService({
      threadStore: {
        async save(thread) {
          threads.set(thread.threadId, thread);
        },
        async get(threadId) {
          return threads.get(threadId);
        },
        async getLatest() {
          return undefined;
        },
        async listByScope() {
          return [];
        },
        async close() {},
      },
    });

    await narrativeService.processTaskUpdate(
      createControlTask({
        taskId: "task-1",
        threadId: baseThread.threadId,
        summary: "Completed repo scan",
        status: "completed",
      }),
    );

    const persistedThread = threads.get(baseThread.threadId);
    expect(persistedThread?.narrativeSummary).toBe("Completed repo scan");
    expect(persistedThread?.narrativeRevision).toBe(1);
    expect(persistedThread?.narrativeState).toEqual({
      threadSummary: "Completed repo scan",
      taskSummaries: ["Completed repo scan"],
      openLoops: [],
      notableEvents: [],
    });

    const narrative = await narrativeService.getNarrative(baseThread.threadId);
    expect(narrative.summary).toBe("Completed repo scan");
    expect(narrative.revision).toBe(1);
  });

  test("reads existing persisted narrative as summary-only compatibility state", async () => {
    const baseThread = {
      ...createThread("thread-2", "/workspace", "project-1"),
      narrativeSummary: "Stored summary",
      narrativeRevision: 3,
      narrativeState: {
        threadSummary: "Stored summary",
        taskSummaries: ["Stored summary"],
        openLoops: ["Need approval on cleanup"],
        notableEvents: [],
      },
    };
    const threads = new Map([[baseThread.threadId, baseThread]]);

    const narrativeService = createThreadNarrativeService({
      threadStore: {
        async save(thread) {
          threads.set(thread.threadId, thread);
        },
        async get(threadId) {
          return threads.get(threadId);
        },
        async getLatest() {
          return undefined;
        },
        async listByScope() {
          return [];
        },
        async close() {},
      },
    });

    const narrative = await narrativeService.getNarrative(baseThread.threadId);
    expect(narrative.summary).toBe("Stored summary");
    expect(narrative.events).toEqual([]);
    expect(narrative.revision).toBe(3);
  });

  test("preserves legacy summary-only threads on non-narrative task updates", async () => {
    const baseThread = {
      ...createThread("thread-3", "/workspace", "project-1"),
      narrativeSummary: "Legacy summary",
      narrativeRevision: 4,
    };
    const threads = new Map([[baseThread.threadId, baseThread]]);

    const narrativeService = createThreadNarrativeService({
      threadStore: {
        async save(thread) {
          threads.set(thread.threadId, thread);
        },
        async get(threadId) {
          return threads.get(threadId);
        },
        async getLatest() {
          return undefined;
        },
        async listByScope() {
          return [];
        },
        async close() {},
      },
    });

    await narrativeService.processTaskUpdate(
      createControlTask({
        taskId: "task-running",
        threadId: baseThread.threadId,
        summary: "Still scanning the repository.",
        status: "running",
      }),
    );

    const persistedThread = threads.get(baseThread.threadId);
    expect(persistedThread?.narrativeSummary).toBe("Legacy summary");
    expect(persistedThread?.narrativeRevision).toBe(4);

    const narrative = await narrativeService.getNarrative(baseThread.threadId);
    expect(narrative.summary).toBe("Legacy summary");
    expect(narrative.events).toEqual([]);
    expect(narrative.revision).toBe(4);
  });

  test("does not let a stale in-memory derived view wipe newer persisted derived state", async () => {
    const threads = new Map<string, ReturnType<typeof createThread>>();
    const baseThread = createThread("thread-4", "/workspace", "project-1");
    threads.set(baseThread.threadId, baseThread);

    const narrativeService = createThreadNarrativeService({
      threadStore: {
        async save(thread) {
          threads.set(thread.threadId, thread);
        },
        async get(threadId) {
          return threads.get(threadId);
        },
        async getLatest() {
          return undefined;
        },
        async listByScope() {
          return [];
        },
        async close() {},
      },
    });

    await narrativeService.processTaskUpdate(
      createControlTask({
        taskId: "task-1",
        threadId: baseThread.threadId,
        summary: "First stable task complete.",
        status: "completed",
      }),
    );

    const externallyUpdated = {
      ...threads.get(baseThread.threadId)!,
      recoveryFacts: {
        ...(threads.get(baseThread.threadId)?.recoveryFacts ?? { pendingApprovals: [] }),
        pendingApprovals: threads.get(baseThread.threadId)?.recoveryFacts?.pendingApprovals ?? [],
        latestDurableAnswer: {
          answerId: "answer-external-1",
          summary: "External answer persisted.",
        },
      },
      narrativeState: {
        threadSummary: "First stable task complete.; External answer persisted.",
        taskSummaries: ["First stable task complete."],
        openLoops: [],
        notableEvents: ["External answer persisted."],
      },
    };
    threads.set(baseThread.threadId, externallyUpdated);

    await narrativeService.processTaskUpdate(
      createControlTask({
        taskId: "task-2",
        threadId: baseThread.threadId,
        summary: "Second stable task complete.",
        status: "completed",
      }),
    );

    const persistedThread = threads.get(baseThread.threadId);
    expect(persistedThread?.recoveryFacts?.latestDurableAnswer).toEqual({
      answerId: "answer-external-1",
      summary: "External answer persisted.",
    });
    expect(persistedThread?.narrativeState?.notableEvents).toEqual(["External answer persisted."]);
    expect(persistedThread?.narrativeState?.threadSummary).toBe(
      "First stable task complete.; External answer persisted.; Second stable task complete.",
    );
  });

  test("prefers newer persisted narrative summary and revision over stale in-memory narrative", async () => {
    const threads = new Map<string, ReturnType<typeof createThread>>();
    const baseThread = createThread("thread-5", "/workspace", "project-1");
    threads.set(baseThread.threadId, baseThread);

    const narrativeService = createThreadNarrativeService({
      threadStore: {
        async save(thread) {
          threads.set(thread.threadId, thread);
        },
        async get(threadId) {
          return threads.get(threadId);
        },
        async getLatest() {
          return undefined;
        },
        async listByScope() {
          return [];
        },
        async close() {},
      },
    });

    await narrativeService.processTaskUpdate(
      createControlTask({
        taskId: "task-old",
        threadId: baseThread.threadId,
        summary: "Older in-memory summary",
        status: "completed",
      }),
    );

    threads.set(baseThread.threadId, {
      ...threads.get(baseThread.threadId)!,
      narrativeSummary: "Newer persisted summary",
      narrativeRevision: 7,
      narrativeState: {
        threadSummary: "Newer persisted summary",
        taskSummaries: ["Newer persisted summary"],
        openLoops: [],
        notableEvents: [],
      },
    });

    const reloadedNarrative = await narrativeService.getNarrative(baseThread.threadId);
    expect(reloadedNarrative.summary).toBe("Newer persisted summary");
    expect(reloadedNarrative.revision).toBe(7);

    await narrativeService.processTaskUpdate(
      createControlTask({
        taskId: "task-new",
        threadId: baseThread.threadId,
        summary: "Fresh completed task",
        status: "completed",
      }),
    );

    const persistedThread = threads.get(baseThread.threadId);
    expect(persistedThread?.narrativeSummary).toBe("Newer persisted summary; Fresh completed task");
    expect(persistedThread?.narrativeRevision).toBe(8);
  });

  test("extends legacy narrative summary on the first derived narrative update", async () => {
    const baseThread = {
      ...createThread("thread-6", "/workspace", "project-1"),
      narrativeSummary: "Legacy summary",
      narrativeRevision: 2,
    };
    const threads = new Map([[baseThread.threadId, baseThread]]);

    const narrativeService = createThreadNarrativeService({
      threadStore: {
        async save(thread) {
          threads.set(thread.threadId, thread);
        },
        async get(threadId) {
          return threads.get(threadId);
        },
        async getLatest() {
          return undefined;
        },
        async listByScope() {
          return [];
        },
        async close() {},
      },
    });

    await narrativeService.processTaskUpdate(
      createControlTask({
        taskId: "task-migrate",
        threadId: baseThread.threadId,
        summary: "First derived summary",
        status: "completed",
      }),
    );

    const persistedThread = threads.get(baseThread.threadId);
    expect(persistedThread?.narrativeSummary).toBe("Legacy summary; First derived summary");
    expect(persistedThread?.narrativeRevision).toBe(3);
    expect(persistedThread?.narrativeState?.threadSummary).toBe(
      "Legacy summary; First derived summary",
    );

    const narrative = await narrativeService.getNarrative(baseThread.threadId);
    expect(narrative.summary).toBe("Legacy summary; First derived summary");
    expect(narrative.revision).toBe(3);
  });

  test("extends legacy summary after a prior non-narrative update persisted an empty derived shell", async () => {
    const baseThread = {
      ...createThread("thread-7", "/workspace", "project-1"),
      narrativeSummary: "Legacy summary",
      narrativeRevision: 5,
    };
    const threads = new Map([[baseThread.threadId, baseThread]]);

    const narrativeService = createThreadNarrativeService({
      threadStore: {
        async save(thread) {
          threads.set(thread.threadId, thread);
        },
        async get(threadId) {
          return threads.get(threadId);
        },
        async getLatest() {
          return undefined;
        },
        async listByScope() {
          return [];
        },
        async close() {},
      },
    });

    await narrativeService.processTaskUpdate(
      createControlTask({
        taskId: "task-running-legacy",
        threadId: baseThread.threadId,
        summary: "Still preparing changes.",
        status: "running",
      }),
    );

    await narrativeService.processTaskUpdate(
      createControlTask({
        taskId: "task-completed-legacy",
        threadId: baseThread.threadId,
        summary: "First derived summary",
        status: "completed",
      }),
    );

    const persistedThread = threads.get(baseThread.threadId);
    expect(persistedThread?.narrativeSummary).toBe("Legacy summary; First derived summary");
    expect(persistedThread?.narrativeRevision).toBe(6);
    expect(persistedThread?.narrativeState?.threadSummary).toBe(
      "Legacy summary; First derived summary",
    );
  });
});
