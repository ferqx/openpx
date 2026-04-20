import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { Screen } from "../../src/surfaces/tui/screen";

describe("Screen", () => {
  test("renders the redesigned welcome state without legacy shell chrome", () => {
    const { lastFrame } = render(
      <Screen
        conversationView={{
          messages: [],
          tasks: [],
          approvals: [],
          agentRuns: [],
          showWelcome: true,
        }}
        utilityView={{}}
        chromeView={{
          workspaceRoot: "/Users/chenchao/Code/ai/openpx",
          projectId: "openpx",
          threadId: "980256af-ce83-4ef3-a34b-83875e4cefe6",
        }}
        composerView={{}}
      />,
    );

    const frame = lastFrame() ?? "";
    const firstNonEmptyLineIndex = frame
      .split("\n")
      .map((line) => line.trim())
      .findIndex((line) => line.length > 0);

    expect(frame).not.toContain("openpx shell");
    expect(frame).not.toContain("thread 980256af-ce83-4ef3-a34b-83875e4cefe6");
    expect(frame).toContain("OpenPX");
    expect(frame).toContain("Ask openpx... Press / for commands");
    expect(frame).not.toContain("Quick actions");
    expect(
      frame.includes("Ask openpx... Press / for commands") || frame.includes("mock-composer"),
    ).toBe(true);
    expect(firstNonEmptyLineIndex).toBeLessThanOrEqual(1);
  });
});
