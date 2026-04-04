import { expect, test } from "bun:test";
import { compactThreadView } from "../../src/control/context/thread-compaction-policy";
import type { DerivedThreadView } from "../../src/control/context/thread-compaction-types";

const baseView: DerivedThreadView = {
  recoveryFacts: {
    pendingApprovals: [],
  },
  narrativeState: {
    threadSummary: "",
    taskSummaries: [],
    openLoops: [],
    notableEvents: [],
  },
  workingSetWindow: {
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
    threadSummary: "",
    taskSummaries: [],
    openLoops: [],
    notableEvents: [],
  },
  workingSetWindow: {
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
  expect(next.narrativeState?.openLoops).toContain("Await approval before deleting src/old.ts");
});
