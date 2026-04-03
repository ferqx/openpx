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
        },
      ],
      tasks: [],
      pendingApprovals: [],
      events: [],
      fallbackLastEventSeq: 0,
      narrativeSummary: "Completed repo scan and isolated the runtime recovery path.",
    });

    expect(snapshot.narrativeSummary).toBe("Completed repo scan and isolated the runtime recovery path.");
  });
});
