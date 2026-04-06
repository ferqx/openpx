import { describe, expect, test } from "bun:test";
import { createThreadStateProjector } from "../../src/control/context/thread-state-projector";
import { compactThreadView } from "../../src/control/context/thread-compaction-policy";
import { hydrateRootState } from "../../src/control/context/root-state-hydrator";
import { createControlTask } from "../../src/control/tasks/task-types";
import { createApprovalRequest } from "../../src/domain/approval";
import { nextId } from "../../src/shared/ids";
import type { DerivedThreadView } from "../../src/control/context/thread-compaction-types";

describe("Stateless Resume Benchmark", () => {
  test("reconstructs execution state from facts without event history", async () => {
    const projector = createThreadStateProjector();
    const threadId = nextId();
    
    // 1. Initial State: A task is blocked on an approval
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

    // Project a blocked task
    view = projector.project(view, {
      kind: "task",
      task: createControlTask({
        taskId: "task-1",
        threadId,
        summary: "Delete critical config",
        status: "blocked",
        blockingReason: { kind: "waiting_approval", message: "Needs user sign-off" }
      })
    });

    // Project a pending approval
    view = projector.project(view, {
      kind: "approval",
      approval: createApprovalRequest({
        approvalRequestId: "app-1",
        threadId,
        taskId: "task-1",
        toolCallId: "tool-1",
        summary: "Delete critical config",
        risk: "high",
        toolRequest: {
          toolCallId: "tool-1",
          threadId,
          taskId: "task-1",
          toolName: "delete_file",
          args: { path: "/etc/config" },
          path: "/etc/config",
          action: "delete_file",
          changedFiles: 1
        }
      })
    });

    // Project some "noise" (working set messages that we will prune)
    view = projector.project(view, { kind: "message", content: "Checking file permissions..." });
    view = projector.project(view, { kind: "tool_result", content: "File exists: /etc/config" });

    // 2. Perform HARD Compaction (simulating aggressive cleanup or sync)
    const compactedView = compactThreadView(view, { trigger: "hard" });

    // 3. SIMULATE STATELESSNESS: Deep clone but completely WIPE the working set window
    // (This simulates fetching ONLY the structural facts from a cloud DB)
    const statelessView: DerivedThreadView = {
      recoveryFacts: JSON.parse(JSON.stringify(compactedView.recoveryFacts)),
      narrativeState: JSON.parse(JSON.stringify(compactedView.narrativeState)),
      workingSetWindow: undefined, // WIPED
    };

    // 4. HYDRATION: Reconstruct the root state
    const hydratedState = hydrateRootState(statelessView, { workspaceRoot: "/tmp", currentCwd: "/tmp" });

    // 5. ASSERTIONS
    // - Mode must be correctly derived as waiting_approval
    expect(hydratedState.mode).toBe("waiting_approval");
    
    // - Revision must be preserved
    expect(hydratedState.revision).toBe(compactedView.recoveryFacts!.revision);

    // - Messages must contain the critical facts despite the raw messages being wiped
    const messageDump = hydratedState.messages.join("\n");
    expect(messageDump).toContain("Delete critical config");
    expect(messageDump).toContain("STATUS: BLOCKED");
    expect(messageDump).toContain("PENDING APPROVALS: Delete critical config");
    
    // - Working set detail must be gone
    expect(messageDump).not.toContain("Checking file permissions");
    expect(messageDump).not.toContain("File exists: /etc/config");
  });
});
