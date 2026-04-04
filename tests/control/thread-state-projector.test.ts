import { describe, expect, test } from "bun:test";
import { createThreadStateProjector } from "../../src/control/context/thread-state-projector";
import { createControlTask } from "../../src/control/tasks/task-types";
import { createApprovalRequest } from "../../src/domain/approval";

describe("ThreadStateProjector", () => {
  test("promotes completed tasks into recovery facts and narrative summaries", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {},
      {
        kind: "task",
        task: createControlTask({
          taskId: "task-2",
          threadId: "thread-1",
          summary: "Executor patched the runtime snapshot path.",
          status: "completed",
        }),
      },
    );

    expect(view.recoveryFacts?.activeTask).toEqual({
      taskId: "task-2",
      status: "completed",
      summary: "Executor patched the runtime snapshot path.",
    });
    expect(view.narrativeState?.taskSummaries).toContain(
      "Executor patched the runtime snapshot path.",
    );
  });

  test("moves pending approvals into recovery facts instead of narrative-only storage", () => {
    const projector = createThreadStateProjector();
    const view = projector.project(
      {},
      {
        kind: "approval",
        approval: createApprovalRequest({
          approvalRequestId: "approval-1",
          threadId: "thread-1",
          taskId: "task-1",
          toolCallId: "tool-call-1",
          toolRequest: {
            toolCallId: "tool-call-1",
            threadId: "thread-1",
            taskId: "task-1",
            toolName: "delete_file",
            args: { path: "tmp/output.txt" },
          },
          summary: "Delete tmp/output.txt",
          risk: "high",
        }),
      },
    );

    expect(view.recoveryFacts?.pendingApprovals).toHaveLength(1);
    expect(view.recoveryFacts?.blocking).toEqual({
      sourceTaskId: "task-1",
      kind: "waiting_approval",
      message: "Delete tmp/output.txt",
    });
    expect(view.narrativeState?.threadSummary ?? "").not.toContain("maybe blocked");
  });

  test("keeps large tool output in the working set window", () => {
    const projector = createThreadStateProjector();
    const toolResult = Array.from({ length: 80 }, (_, index) => `line ${index}`).join("\n");
    const view = projector.project(
      {},
      {
        kind: "tool_result",
        content: toolResult,
      },
    );

    expect(view.workingSetWindow?.toolResults).toEqual([toolResult]);
    expect(view.narrativeState?.taskSummaries ?? []).toHaveLength(0);
  });
});
