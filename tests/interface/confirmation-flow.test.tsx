import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { App } from "../../src/interface/tui/app";
import type { TuiKernel } from "../../src/interface/tui/hooks/use-kernel";

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

    let commandCalled = false;
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      handleCommand: async () => {
        commandCalled = true;
        return {
          status: "waiting_approval",
          threadId: "thread-1",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          summary: "Agent team ready to start",
          blockingReason: {
            kind: "waiting_approval",
            message: "Agent team ready to start",
          },
          tasks: [
            {
              taskId: "t1",
              threadId: "thread-1",
              summary: "The Plan",
              status: "blocked",
              blockingReason: {
                kind: "waiting_approval",
                message: "Agent team ready to start",
              },
            },
          ],
          approvals: [
            {
              approvalRequestId: "approval-1",
              threadId: "thread-1",
              taskId: "t1",
              toolCallId: "tool-1",
              summary: "Agent team ready to start",
              risk: "team.start",
              status: "pending",
            },
          ],
          answers: [],
          workers: [],
          threads: [],
        };
      },
      hydrateSession: async () => undefined,
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);
    
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
      () => (lastFrame() ?? "").includes("Confirm work?"),
      "expected confirmation prompt to appear",
      50
    );
    
    expect(lastFrame()).toContain("Confirm work?");
  });
});
