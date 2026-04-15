import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { Composer } from "../../src/surfaces/tui/components/composer";

describe("Composer", () => {
  test("renders as a flat input bar instead of a bordered card", async () => {
    const { lastFrame } = render(<Composer isActive={false} />);

    const frame = lastFrame() ?? "";

    expect(frame).toContain("Ask openpx... Press / for commands");
    expect(frame).not.toContain("╭");
    expect(frame).not.toContain("╰");
    expect(frame).not.toContain("│");
  });
});
