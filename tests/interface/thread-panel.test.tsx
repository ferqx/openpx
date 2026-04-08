import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ThreadPanel } from "../../src/interface/tui/components/thread-panel";

describe("ThreadPanel", () => {
  test("renders active and blocked threads with their durable summaries", () => {
    const { lastFrame } = render(
      <ThreadPanel
        activeThreadId="thread-active"
        threads={[
          {
            threadId: "thread-active",
            workspaceRoot: "/tmp/workspace",
            projectId: "project-1",
            revision: 4,
            status: "active",
            activeRunStatus: "waiting_approval",
            narrativeSummary: "Current active runtime recovery thread.",
            pendingApprovalCount: 1,
          },
          {
            threadId: "thread-blocked",
            workspaceRoot: "/tmp/workspace",
            projectId: "project-1",
            revision: 2,
            status: "active",
            activeRunStatus: "blocked",
            narrativeSummary: "Manual recovery pending for a risky patch.",
            blockingReasonKind: "human_recovery",
          },
        ]}
      />,
    );

    const frame = lastFrame();

    expect(frame).toContain("threads");
    expect(frame).toContain("thread-active");
    expect(frame).toContain("active");
    expect(frame).toContain("1 approval");
    expect(frame).toContain("blocked");
    expect(frame).toContain("recovery");
    expect(frame).toContain("Current active runtime recovery thread.");
    expect(frame).toContain("Manual recovery pending for a risky patch.");
  });
});
