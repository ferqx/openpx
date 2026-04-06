import { describe, expect, test } from "bun:test";
import { createThread } from "../../src/domain/thread";
import { projectSessionResult } from "../../src/kernel/session-view-projector";

describe("projectSessionResult", () => {
  test("builds a stable session view from thread and summary data", async () => {
    const thread = createThread("thread-1", "/workspace", "project-1");
    const result = await projectSessionResult({
      thread,
      status: "completed",
      workspaceRoot: "/workspace",
      projectId: "project-1",
      summary: "Completed repo scan",
      approvals: [],
      threads: [
        {
          threadId: "thread-1",
          status: "completed",
          narrativeSummary: "Completed repo scan",
          pendingApprovalCount: 0,
        },
      ],
    });

    expect(result.threadId).toBe("thread-1");
    expect(result.status).toBe("completed");
    expect(result.summary).toBe("Completed repo scan");
    expect(result.threads).toHaveLength(1);
  });
});
