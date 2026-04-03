import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { App } from "../../src/interface/tui/app";
import { createEventBus } from "../../src/kernel/event-bus";

describe("Confirmation Flow", () => {
  test("shows 'Agent team ready. Start? [Y/n]' after plan", async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    async function waitFor(check: () => boolean, message: string, attempts = 20) {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (check()) {
          return;
        }
        await tick();
      }
      throw new Error(message);
    }

    const events = createEventBus();
    let commandCalled = false;
    const kernel = {
      events,
      handleCommand: async () => {
        commandCalled = true;
        return {
          status: "waiting_approval",
          tasks: [{ taskId: "t1", summary: "The Plan", status: "queued" }],
        };
      },
      hydrateSession: async () => undefined,
    };

    const { lastFrame, stdin } = render(<App kernel={kernel as any} />);
    
    // Submit some input
    for (const char of "new task") {
      stdin.write(char);
      await tick();
    }
    await waitFor(() => (lastFrame() ?? "").includes("new task"), "input not rendered");
    stdin.write("\r");
    await tick();
    
    // Wait for command call
    await waitFor(() => commandCalled, "handleCommand not called", 100);
    
    // Wait for frame update
    await waitFor(
      () => (lastFrame() ?? "").includes("Agent team ready"),
      "expected confirmation prompt to appear",
      50
    );
    
    expect(lastFrame()).toContain("Agent team ready. Start? [Y/n]");
  });
});
