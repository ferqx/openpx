import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { main } from "../../src/app/main";
import { App } from "../../src/interface/tui/app";

describe("TUI App", () => {
  test("renders the core task shell regions and submits composer input", async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    async function waitFor(check: () => boolean, attempts = 20) {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (check()) {
          return;
        }

        await tick();
      }
    }

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
    await waitFor(() => (lastFrame() ?? "").includes("plan the repo"));
    stdin.write("\r");
    await waitFor(() => receivedCommand?.payload.text === "plan the repo");

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

  test("renders task and approval state returned by the kernel", async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const kernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand() {
        return {
          status: "waiting_approval",
          summary: "Approval required before deleting src/old.ts",
          tasks: [
            {
              taskId: "task_1",
              summary: "delete src/old.ts",
              status: "blocked",
            },
          ],
          approvals: [
            {
              approvalRequestId: "approval_1",
              summary: "apply_patch delete_file src/old.ts",
              status: "pending",
            },
          ],
        };
      },
    };
    const { lastFrame, stdin } = render(<App kernel={kernel} />);

    await tick();
    for (const char of "delete src/old.ts") {
      stdin.write(char);
      await tick();
    }
    stdin.write("\r");
    await tick();

    const frame = lastFrame();

    expect(frame).toContain("delete src/old.ts [blocked]");
    expect(frame).toContain("apply_patch delete_file src/old.ts [pending]");
    expect(frame).toContain("Approval required before deleting src/old.ts");
  });

  test("main mounts the Ink shell with the bootstrapped kernel", async () => {
    const mounted: unknown[] = [];

    await (main as (input: {
      workspaceRoot: string;
      dataDir: string;
      mount: (tree: React.ReactElement) => unknown;
    }) => Promise<unknown>)({
      workspaceRoot: "/tmp/main-entrypoint-workspace",
      dataDir: ":memory:",
      mount(tree) {
        mounted.push(tree);
        return { unmount() {} };
      },
    });

    expect(mounted).toHaveLength(1);
    const appElement = mounted[0] as React.ReactElement<{ kernel?: { handleCommand?: unknown } }>;
    expect(appElement.type).toBe(App);
    expect(typeof appElement.props.kernel?.handleCommand).toBe("function");
  });
});
