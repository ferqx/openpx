import { expect, test } from "bun:test";
import { compactThreadView } from "../../src/control/context/thread-compaction-policy";
import type { DerivedThreadView } from "../../src/control/context/thread-compaction-types";

const now = new Date().toISOString();

const baseView: DerivedThreadView = {
  recoveryFacts: {
    threadId: "thread-1",
    revision: 1,
    schemaVersion: 1,
    status: "active",
    updatedAt: now,
    pendingApprovals: [],
  },
  narrativeState: {
    revision: 1,
    updatedAt: now,
    threadSummary: "",
    taskSummaries: [],
    openLoops: [],
    notableEvents: [],
  },
  workingSetWindow: {
    revision: 1,
    updatedAt: now,
    messages: ["1", "2", "3", "4", "5", "Need to rerun verifier after patch."],
    toolResults: ["1", "2", "3", "4", "5", "6"],
    verifierFeedback: [],
    retrievedMemories: [],
  },
};

test("soft compact trims large tool output but keeps the latest working context", () => {
  const next = compactThreadView(baseView, {
    trigger: "soft",
    tokenPressure: 0.4,
  });

  expect(next.workingSetWindow?.messages.at(-1)).toBe("Need to rerun verifier after patch.");
  expect(next.workingSetWindow?.toolResults).toHaveLength(5);
});

const blockedView: DerivedThreadView = {
  recoveryFacts: {
    threadId: "thread-1",
    revision: 1,
    schemaVersion: 1,
    status: "active",
    updatedAt: now,
    pendingApprovals: [],
    activeTask: {
      taskId: "task-1",
      status: "blocked",
      summary: "Await approval before deleting src/old.ts",
    },
    blocking: {
      sourceTaskId: "task-1",
      kind: "waiting_approval",
      message: "Please approve deletion.",
    },
  },
  narrativeState: {
    revision: 1,
    updatedAt: now,
    threadSummary: "",
    taskSummaries: [],
    openLoops: [],
    notableEvents: [],
  },
  workingSetWindow: {
    revision: 1,
    updatedAt: now,
    messages: ["Need approval."],
    toolResults: [],
    verifierFeedback: [],
    retrievedMemories: [],
  },
};

test("boundary compact freezes recovery facts and records an open loop", () => {
  const next = compactThreadView(blockedView, {
    trigger: "boundary",
    tokenPressure: 0.2,
  });

  expect(next.recoveryFacts?.blocking?.kind).toBe("waiting_approval");
  expect(next.recoveryFacts?.revision).toBe(blockedView.recoveryFacts?.revision);
  expect(next.narrativeState?.openLoops).toContain("Await approval before deleting src/old.ts");
  expect(next.narrativeState?.threadSummary).toBe("");
});

test("hard compact prunes working state without inventing narrative events", () => {
  const next = compactThreadView(baseView, {
    trigger: "hard",
  });

  expect(next.workingSetWindow?.messages).toHaveLength(2);
  expect(next.workingSetWindow?.toolResults).toHaveLength(2);
  expect(next.recoveryFacts).toEqual(baseView.recoveryFacts);
  expect(next.narrativeState?.notableEvents).toEqual([]);
});
