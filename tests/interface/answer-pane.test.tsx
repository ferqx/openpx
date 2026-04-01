import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { AnswerPane } from "../../src/interface/tui/components/answer-pane";

describe("AnswerPane", () => {
  test("shows changed files and line deltas", () => {
    const verificationLine = "bun test tests/runtime/root-graph.test.ts PASS";
    const { lastFrame } = render(
      <AnswerPane
        summary="Updated planner routing"
        changes={[{ path: "src/runtime/graph/root/graph.ts", additions: 24, deletions: 8 }]}
        verification={[verificationLine]}
      />,
    );

    const frame = lastFrame();
    expect(frame).toContain("Updated planner routing");
    expect(frame).toContain("graph.ts");
    expect(frame).toContain("+24");
    expect(frame).toContain("-8");
    expect(frame).toContain(verificationLine);
  });
});
