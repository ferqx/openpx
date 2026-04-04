import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { main } from "../../src/app/main";
import { App } from "../../src/interface/tui/app";
import type { TuiKernel } from "../../src/interface/tui/hooks/use-kernel";
import type { ApprovalCommand, SubmitInputCommand, ThreadCommand } from "../../src/interface/tui/commands";

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

    let receivedCommand: SubmitInputCommand | ApprovalCommand | ThreadCommand | undefined;
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

    expect(frame).toContain("openpx");
    expect(frame).toContain("›");
    expect(frame).toContain("PROJECT");
    expect(frame).toContain("THREAD");
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

    expect(frame).toContain("Agent:");
    expect(frame).toContain("Approval required before deleting src/old.ts");
    expect(frame).toMatch(/Action Required:.*apply_patch delete_file src\/old\.ts/);
    expect(frame).toMatch(/Confirm work\?.*\[Y\/n\]/);
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

    expect(frame).toContain("Agent:");
    expect(frame).toContain("Approval required before deleting src/resume-me.ts");
    expect(frame).toMatch(/Action Required:.*apply_patch delete_file src\/resume-me\.ts/);
    expect(frame).toMatch(/Confirm work\?.*\[Y\/n\]/);
  });

  test("shows the active thread narrative summary when no fresh answer is available", async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async hydrateSession() {
        return {
          status: "completed",
          summary: "Awaiting answer",
          narrativeSummary: "Completed repo scan and isolated runtime recovery work.",
          tasks: [],
          approvals: [],
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

    expect(frame).toContain("Thread:");
    expect(frame).toContain("Completed repo scan and isolated runtime recovery work.");
  });

  test("renders a thread panel with active and blocked thread summaries", async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async hydrateSession() {
        return {
          status: "completed",
          summary: "Awaiting answer",
          threadId: "thread-active",
          narrativeSummary: "Current active runtime recovery thread.",
          threads: [
            {
              threadId: "thread-active",
              workspaceRoot: "/tmp/workspace",
              projectId: "project-1",
              revision: 4,
              status: "active",
              narrativeSummary: "Current active runtime recovery thread.",
              pendingApprovalCount: 1,
            },
            {
              threadId: "thread-blocked",
              workspaceRoot: "/tmp/workspace",
              projectId: "project-1",
              revision: 2,
              status: "blocked",
              narrativeSummary: "Manual recovery pending for a risky patch.",
              blockingReasonKind: "human_recovery",
            },
          ],
          tasks: [],
          approvals: [],
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

    expect(frame).toContain("THREADS");
    expect(frame).toContain("thread-active");
    expect(frame).toContain("thread-blocked");
    expect(frame).toContain("approval:1");
    expect(frame).toContain("human_recovery");
    expect(frame).toContain("Current active runtime recovery thread.");
    expect(frame).toContain("Manual recovery pending for a risky patch.");
  });

  test("renders a manual-recovery shell when the hydrated thread is blocked", async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async hydrateSession() {
        return {
          status: "blocked",
          summary: "Awaiting answer",
          blockingReason: {
            kind: "human_recovery",
            message: "Manual recovery required for apply_patch; previous execution outcome is uncertain after a crash.",
          },
          tasks: [
            {
              taskId: "task_recovery",
              summary: "Apply risky patch",
              status: "blocked",
            },
          ],
          approvals: [],
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

    expect(frame).toContain("Manual recovery required for apply_patch");
    expect(frame).toContain("uncertain after a");
    expect(frame).toMatch(/Session blocked: manual recovery required/i);
    expect(frame).toMatch(/Inspect the workspace state before continuing/i);
    expect(frame).toMatch(/Input disabled for this thread/i);
  });

  test("reacts to live blocked recovery events without a hydrate refresh", async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    let emit: ((event: Parameters<NonNullable<TuiKernel["events"]["subscribe"]>>[0] extends (event: infer E) => void ? E : never) => void) | undefined;

    const kernel: TuiKernel = {
      events: {
        subscribe(handler) {
          emit = handler;
          return () => undefined;
        },
      },
      async handleCommand() {
        return { status: "completed" };
      },
    };

    const { lastFrame } = render(<App kernel={kernel} />);
    await tick();

    emit?.({
      type: "task.updated",
      payload: {
        taskId: "task_live_recovery",
        summary: "Recover risky patch",
        status: "blocked",
        blockingReason: {
          kind: "human_recovery",
          message: "Manual recovery required from live event.",
        },
      },
    });
    emit?.({
      type: "thread.blocked",
      payload: {
        threadId: "thread_live_recovery",
        blockingReason: {
          kind: "human_recovery",
          message: "Manual recovery required from live event.",
        },
      },
    });
    await tick();
    await tick();

    const frame = lastFrame();

    expect(frame).toMatch(/Session blocked: manual recovery required/i);
    expect(frame).toContain("Manual recovery required from live event.");
    expect(frame).toMatch(/Input disabled for this thread/i);
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
