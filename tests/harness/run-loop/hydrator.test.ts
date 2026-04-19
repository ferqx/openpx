import { describe, expect, test } from "bun:test";
import { compactThreadView } from "../../../src/control/context/thread-compaction-policy";
import type { DerivedThreadView } from "../../../src/control/context/thread-compaction-types";
import { createThreadStateProjector } from "../../../src/control/context/thread-state-projector";
import { createApprovalRequest } from "../../../src/domain/approval";
import { createControlTask } from "../../../src/control/tasks/task-types";
import { hydrateRunLoopState } from "../../../src/control/context/root-state-hydrator";
import { nextId } from "../../../src/shared/ids";

describe("run-loop hydrator", () => {
  test("在工作集被清空后仍能从压缩事实恢复等待审批状态", () => {
    const projector = createThreadStateProjector();
    const threadId = nextId();

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

    view = projector.project(view, {
      kind: "task",
      task: createControlTask({
        taskId: "task-1",
        threadId,
        summary: "Delete critical config",
        status: "blocked",
        blockingReason: { kind: "waiting_approval", message: "Needs user sign-off" },
      }),
    });

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
          changedFiles: 1,
        },
      }),
    });

    const compactedView = compactThreadView(view, { trigger: "hard" });
    const statelessView: DerivedThreadView = {
      recoveryFacts: JSON.parse(JSON.stringify(compactedView.recoveryFacts)),
      narrativeState: JSON.parse(JSON.stringify(compactedView.narrativeState)),
      workingSetWindow: undefined,
    };

    const hydratedState = hydrateRunLoopState(statelessView, {
      workspaceRoot: "/tmp",
      currentCwd: "/tmp",
    });

    expect(hydratedState.nextStep).toBe("waiting_approval");
    expect(hydratedState.recoveryFacts?.revision).toBe(compactedView.recoveryFacts?.revision);
    expect(hydratedState.systemMessages.join("\n")).toContain("PENDING APPROVALS");
    expect(hydratedState.systemMessages.join("\n")).toContain("Delete critical config");
  });
});
