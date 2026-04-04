import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ThreadPanel } from "../../src/interface/tui/components/thread-panel";

describe("ThreadPanel", () => {
  test("renders active and blocked threads with their durable summaries", () => {
    const { lastFrame } = render(
      <ThreadPanel
        threads={[
          {
            id: "thread-active",
            status: "active",
            narrativeSummary: "Current active runtime recovery thread.",
            active: true,
            pendingApprovalCount: 1,
          },
          {
            id: "thread-blocked",
            status: "blocked",
            narrativeSummary: "Manual recovery pending for a risky patch.",
            blockingReasonKind: "human_recovery",
          },
        ]}
      />,
    );

    const frame = lastFrame();

    expect(frame).toContain("THREADS");
    expect(frame).toContain("thread-active (active) [active]");
    expect(frame).toContain("thread-blocked [blocked]");
    expect(frame).toContain("approval:1");
    expect(frame).toContain("human_recovery");
    expect(frame).toContain("Current active runtime recovery thread.");
    expect(frame).toContain("Manual recovery pending for a risky patch.");
  });
});
