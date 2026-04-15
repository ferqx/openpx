import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { Markdown } from "../../src/surfaces/tui/components/markdown";

describe("Markdown", () => {
  test("renders common markdown syntax without leaving underscore markers behind", () => {
    const { lastFrame } = render(
      <Markdown>
        {"# Title\n\nUses _italic_, __bold__, and [docs](https://example.com)."}
      </Markdown>,
    );

    const frame = lastFrame() ?? "";

    expect(frame).toContain("Title");
    expect(frame).toContain("italic");
    expect(frame).toContain("bold");
    expect(frame).toContain("docs");
    expect(frame).not.toContain("_italic_");
    expect(frame).not.toContain("__bold__");
  });
});
