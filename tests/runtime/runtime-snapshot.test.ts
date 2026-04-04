import { describe, expect, test } from "bun:test";
import { buildRuntimeSnapshot } from "../../src/runtime/service/runtime-snapshot";

describe("Runtime snapshot", () => {
  test("includes narrative summary in the client-facing snapshot contract", () => {
    const snapshot = buildRuntimeSnapshot({
      scope: {
        workspaceRoot: "/tmp/workspace",
        projectId: "project-1",
      },
      activeThread: {
        threadId: "thread-1",
        workspaceRoot: "/tmp/workspace",
        projectId: "project-1",
        revision: 2,
        status: "completed",
      },
      threads: [
        {
          threadId: "thread-1",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          revision: 2,
          status: "completed",
          narrativeSummary: "Completed repo scan and isolated the runtime recovery path.",
          narrativeRevision: 1,
          pendingApprovalCount: 1,
          blockingReasonKind: "human_recovery",
        },
      ],
      tasks: [],
      pendingApprovals: [],
      events: [],
      fallbackLastEventSeq: 0,
      narrativeSummary: "Completed repo scan and isolated the runtime recovery path.",
    });

    expect(snapshot.narrativeSummary).toBe("Completed repo scan and isolated the runtime recovery path.");
    expect(snapshot.threads[0]?.narrativeSummary).toBe("Completed repo scan and isolated the runtime recovery path.");
    expect(snapshot.threads[0]?.pendingApprovalCount).toBe(1);
    expect(snapshot.threads[0]?.blockingReasonKind).toBe("human_recovery");
  });
});
