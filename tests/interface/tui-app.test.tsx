import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { App } from "../../src/interface/tui/app";

describe("TUI App", () => {
  test("renders the core task shell regions", () => {
    const kernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand() {
        return { status: "completed" };
      },
    };
    const { lastFrame } = render(<App kernel={kernel} />);
    const frame = lastFrame();

    expect(frame).toContain("Composer");
    expect(frame).toContain("Events");
    expect(frame).toContain("Tasks");
    expect(frame).toContain("Answer");
  });
});
