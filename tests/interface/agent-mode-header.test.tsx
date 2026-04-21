import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { AgentModeHeader } from "../../src/surfaces/tui/components/agent-mode-header";

describe("AgentModeHeader", () => {
  test("renders the primary agent and current thread mode separately", () => {
    const { lastFrame } = render(
      <AgentModeHeader primaryAgent="build" threadMode="plan" />,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Agent: Build");
    expect(frame).toContain("Mode: plan");
  });
});
