import { describe, expect, test } from "bun:test";
import { createThreadStateProjector } from "../../src/control/context/thread-state-projector";
import { hydrateRootState } from "../../src/control/context/root-state-hydrator";
import { nextId } from "../../src/shared/ids";
import type { DerivedThreadView } from "../../src/control/context/thread-compaction-types";

describe("Kernel Side-Effect Idempotency", () => {
  const workspaceRoot = "/tmp/repo";
  const currentCwd = "/tmp/repo";

  test("tracks pending tool calls to prevent accidental re-execution on resume", async () => {
    const projector = createThreadStateProjector();
    const threadId = nextId();
    
    // 1. Initial State
    let view: DerivedThreadView = {
      recoveryFacts: {
        threadId,
        revision: 1,
        schemaVersion: 1,
        status: "active",
        updatedAt: new Date().toISOString(),
        pendingApprovals: [],
      },
    };

    // 2. Simulate the middle of a side-effect: Tool call started but not finished
    const toolCallId = "tool-1";
    view = projector.project(view, {
      kind: "task",
      task: {
        taskId: "task-1",
        threadId,
        runId: "run-1",
        summary: "Update package.json",
        status: "running"
      }
    });

    // Manually set ledger state to simulate a mid-execution crash record
    view.recoveryFacts!.ledgerState = {
      pendingToolCallId: toolCallId
    };

    // 3. HYDRATION: Simulate resume after crash
    const hydratedState = hydrateRootState(view, { workspaceRoot, currentCwd });

    // 4. ASSERTIONS
    // - Ledger state must be preserved
    expect(hydratedState.recoveryFacts?.ledgerState?.pendingToolCallId).toBe(toolCallId);
    
    // - System message should exist to guide the agent
    // Note: We might want to explicitly add a ledger status message in hydrateRootState
    // Let's refine the expectations: 
    // The model needs to know that tool-1 might have partially executed.
  });
});
