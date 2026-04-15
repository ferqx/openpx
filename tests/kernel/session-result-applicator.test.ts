import { describe, expect, mock, test } from "bun:test";
import type { ThreadNarrativeService } from "../../src/control/context/thread-narrative-service";
import { createThread } from "../../src/domain/thread";
import { applySessionControlPlaneResult } from "../../src/harness/core/run/session-result-applicator";

describe("applySessionControlPlaneResult", () => {
  test("projects control-plane results into persisted thread truth", async () => {
    const thread = createThread("thread-apply", "/workspace", "project-1");
    const savedThreads: typeof thread[] = [];
    const narrativeService: ThreadNarrativeService = {
      processTaskUpdate: mock(async () => undefined),
      getNarrative: async (threadId) => ({ threadId, summary: "summary", events: [], revision: 1 }),
    };

    const nextThread = await applySessionControlPlaneResult({
      thread,
      result: {
        status: "waiting_approval",
        task: {
          taskId: "task-apply",
          threadId: thread.threadId,
          runId: "run-apply",
          summary: "Apply patch",
          status: "blocked",
          blockingReason: {
            kind: "waiting_approval",
            message: "Need approval",
          },
        },
        approvals: [
          {
            approvalRequestId: "approval-apply",
            threadId: thread.threadId,
            runId: "run-apply",
            taskId: "task-apply",
            toolCallId: "tool-apply",
            toolRequest: {
              toolCallId: "tool-apply",
              threadId: thread.threadId,
              runId: "run-apply",
              taskId: "task-apply",
              toolName: "apply_patch",
              args: {},
            },
            summary: "apply_patch update_file src/app.ts",
            risk: "apply_patch.update_file",
            status: "pending",
          },
        ],
        summary: "Need approval",
        pendingToolCallId: "tool-apply",
        pendingToolName: "apply_patch",
      },
      narrativeService,
      saveThread: async (candidate) => {
        savedThreads.push(candidate);
      },
    });

    expect(savedThreads).toHaveLength(1);
    expect(nextThread.recoveryFacts?.blocking?.kind).toBe("waiting_approval");
    expect(nextThread.recoveryFacts?.latestDurableAnswer?.summary).toBe("Need approval");
    expect(nextThread.recoveryFacts?.conversationHistory?.at(-1)?.content).toBe("Need approval");
    expect(narrativeService.processTaskUpdate).toHaveBeenCalled();
  });
});
