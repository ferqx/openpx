import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { App } from "../../src/interface/tui/app";

describe("TUI App", () => {
  test("renders the core task shell regions and submits composer input", async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    let receivedCommand:
      | {
          type: string;
          payload: { text: string };
        }
      | undefined;
    const kernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand(command: { type: string; payload: { text: string } }) {
        receivedCommand = command;
        return { status: "completed" };
      },
    };
    const { lastFrame, stdin } = render(<App kernel={kernel} />);

    await tick();
    for (const char of "plan the repo") {
      stdin.write(char);
      await tick();
    }
    stdin.write("\r");
    await tick();

    const frame = lastFrame();

    expect(frame).toContain("Composer");
    expect(frame).toContain("Events");
    expect(frame).toContain("Tasks");
    expect(frame).toContain("Answer");
    expect(receivedCommand).toEqual({
      type: "submit_input",
      payload: { text: "plan the repo" },
    });
  });
});
