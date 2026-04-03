import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { main } from "../../src/app/main";
import { App } from "../../src/interface/tui/app";
import type { TuiKernel } from "../../src/interface/tui/hooks/use-kernel";
import type { ApprovalCommand, SubmitInputCommand } from "../../src/interface/tui/commands";

describe("TUI App", () => {
  test("renders the core task shell regions and submits composer input", async () => {
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

    let receivedCommand: SubmitInputCommand | ApprovalCommand | undefined;
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand(command) {
        receivedCommand = command;
        return { status: "completed" };
      },
    };
    const { lastFrame, stdin } = render(<App kernel={kernel} />);

    await tick();
    stdin.write("plan the repo");
    await waitFor(
      () => (lastFrame() ?? "").includes("plan the repo"),
      "expected composer to render the full input before submit",
    );
    await tick();
    stdin.write("\r");
    await waitFor(
      () => receivedCommand?.type === "submit_input" && receivedCommand.payload.text === "plan the repo",
      "expected kernel to receive the full submitted command",
    );

    const frame = lastFrame();

    expect(frame).toContain("Composer");
    expect(frame).toContain("Events");
    expect(frame).toContain("TASKS");
    expect(frame).toContain("Answer");
    expect(receivedCommand).toEqual({
      type: "submit_input",
      payload: { text: "plan the repo" },
    });
  });

  test("renders task and approval state returned by the kernel", async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const kernel: TuiKernel = {
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

    expect(frame).toContain("delete src/old.ts");
    expect(frame).toContain("apply_patch delete_file src/old.ts [pending]");
    expect(frame).toContain("Approval required before deleting src/old.ts");
    expect(frame).toContain("Agent team ready. Start? [Y/n]");
  });

  test("hydrates the latest blocked session state on mount", async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async hydrateSession() {
        return {
          status: "waiting_approval",
          summary: "Approval required before deleting src/resume-me.ts",
          tasks: [
            {
              taskId: "task_resume",
              summary: "delete src/resume-me.ts",
              status: "blocked",
            },
          ],
          approvals: [
            {
              approvalRequestId: "approval_resume",
              summary: "apply_patch delete_file src/resume-me.ts",
              status: "pending",
            },
          ],
        };
      },
      async handleCommand() {
        return { status: "completed" };
      },
    };

    const { lastFrame } = render(<App kernel={kernel} />);
    await tick();
    await tick();
    await tick();

    const frame = lastFrame();

    expect(frame).toContain("delete src/resume-me.ts");
    expect(frame).toContain("apply_patch delete_file src/resume-me.ts");
    expect(frame).toContain("[pending]");
    expect(frame).toContain("Approval required before deleting");
    expect(frame).toContain("src/resume-me.ts");
    expect(frame).toContain("Agent team ready. Start? [Y/n]");
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
