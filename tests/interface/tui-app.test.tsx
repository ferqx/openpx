import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { main } from "../../src/app/main";
import { App } from "../../src/interface/tui/app";
import type { TuiKernel } from "../../src/interface/tui/hooks/use-kernel";
import type { ApprovalCommand, SubmitInputCommand, ThreadCommand } from "../../src/interface/tui/commands";
import type { RuntimeSessionState } from "../../src/interface/runtime/runtime-session";

describe("TUI App", () => {
  const tick = (delayMs = 0) => new Promise((resolve) => setTimeout(resolve, delayMs));
  function createCompletedSessionResult(overrides: Partial<RuntimeSessionState> = {}): RuntimeSessionState {
    return {
      status: "completed",
      summary: "Awaiting answer",
      workspaceRoot: "/tmp/workspace",
      projectId: "project-1",
      tasks: [],
      approvals: [],
      answers: [],
      workers: [],
      threads: [],
      ...overrides,
    };
  }

  async function waitFor(check: () => boolean, message: string, attempts = 20, delayMs = 10) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (check()) {
        return;
      }

      await tick(delayMs);
    }

    throw new Error(message);
  }

  test("renders the core task shell regions and submits composer input", async () => {
    let receivedCommand: SubmitInputCommand | ApprovalCommand | ThreadCommand | undefined;
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand(command) {
        receivedCommand = command;
        return createCompletedSessionResult();
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
    const expectedModelName = process.env.OPENAI_MODEL ?? "unknown";

    expect(frame).toContain("openpx");
    expect(frame).toContain("❯");
    expect(frame).toContain(expectedModelName);
    expect(receivedCommand).toEqual({
      type: "submit_input",
      payload: { text: "plan the repo" },
    });
  });

  test("renders task and approval state returned by the kernel", async () => {
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
          threadId: "thread_1",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          blockingReason: {
            kind: "waiting_approval",
            message: "apply_patch delete_file src/old.ts",
          },
          tasks: [
            {
              taskId: "task_1",
              threadId: "thread_1",
              status: "blocked",
              summary: "delete src/old.ts",
              blockingReason: {
                kind: "waiting_approval",
                message: "apply_patch delete_file src/old.ts",
              },
            },
          ],
          approvals: [
            {
              approvalRequestId: "approval_1",
              threadId: "thread_1",
              taskId: "task_1",
              toolCallId: "tool_1",
              summary: "apply_patch delete_file src/old.ts",
              risk: "apply_patch.delete_file",
              status: "pending",
            },
          ],
          answers: [],
          workers: [],
          threads: [],
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

    expect(frame).toContain("Action Required:");
    expect(frame).toContain("Approval required before deleting src/old.ts");
    expect(frame).toContain("Action Required:");
    expect(frame).toContain("apply_patch delete_file src/old.ts");
    expect(frame).toMatch(/Confirm work\?.*\[Y\/n\]/);
  });

  test("hydrates the latest blocked session state on mount", async () => {
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
          threadId: "thread_resume",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          blockingReason: {
            kind: "waiting_approval",
            message: "apply_patch delete_file src/resume-me.ts",
          },
          tasks: [
            {
              taskId: "task_resume",
              threadId: "thread_resume",
              status: "blocked",
              summary: "delete src/resume-me.ts",
              blockingReason: {
                kind: "waiting_approval",
                message: "apply_patch delete_file src/resume-me.ts",
              },
            },
          ],
          approvals: [
            {
              approvalRequestId: "approval_resume",
              threadId: "thread_resume",
              taskId: "task_resume",
              toolCallId: "tool_resume",
              summary: "apply_patch delete_file src/resume-me.ts",
              risk: "apply_patch.delete_file",
              status: "pending",
            },
          ],
          answers: [],
          workers: [],
          threads: [],
        };
      },
      async handleCommand() {
        return createCompletedSessionResult();
      },
    };

    const { lastFrame } = render(<App kernel={kernel} />);
    await waitFor(
      () => (lastFrame() ?? "").includes("apply_patch delete_file src/resume-me.ts"),
      "expected hydrated approval shell to render",
    );

    const frame = lastFrame();

    expect(frame).toContain("Action Required:");
    expect(frame).toContain("Approval required before deleting src/resume-me.ts");
    expect(frame).toContain("Action Required:");
    expect(frame).toContain("apply_patch delete_file src/resume-me.ts");
    expect(frame).toMatch(/Confirm work\?.*\[Y\/n\]/);
  });

  test("shows the active thread narrative summary when no fresh answer is available", async () => {
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
          threadId: "thread-narrative",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          narrativeSummary: "Completed repo scan and isolated runtime recovery work.",
          tasks: [],
          approvals: [],
          answers: [],
          workers: [],
          threads: [],
        };
      },
      async handleCommand() {
        return createCompletedSessionResult();
      },
    };

    const { lastFrame } = render(<App kernel={kernel} />);
    await waitFor(
      () => (lastFrame() ?? "").includes("Completed repo scan and isolated runtime recovery work."),
      "expected narrative summary to render when no fresh answer is available",
    );

    const frame = lastFrame();

    expect(frame).not.toContain("Thread:");
    expect(frame).toContain("Completed repo scan and isolated runtime recovery work.");
  });

  test("keeps the thread panel hidden by default", async () => {
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
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
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
          answers: [],
          workers: [],
        };
      },
      async handleCommand() {
        return createCompletedSessionResult();
      },
    };

    const { lastFrame } = render(<App kernel={kernel} />);
    await waitFor(
      () => (lastFrame() ?? "").includes("Current active runtime recovery thread."),
      "expected hydrated thread summary to render before checking panel visibility",
    );

    const frame = lastFrame();

    expect(frame).not.toContain("THREADS");
    expect(frame).not.toContain("thread-blocked");
  });

  test("renders a manual-recovery shell when the hydrated thread is blocked", async () => {
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
          threadId: "thread_recovery",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          blockingReason: {
            kind: "human_recovery",
            message: "Manual recovery required for apply_patch; previous execution outcome is uncertain after a crash.",
          },
          tasks: [
            {
              taskId: "task_recovery",
              threadId: "thread_recovery",
              status: "blocked",
              summary: "Apply risky patch",
              blockingReason: {
                kind: "human_recovery",
                message: "Manual recovery required for apply_patch; previous execution outcome is uncertain after a crash.",
              },
            },
          ],
          approvals: [],
          answers: [],
          workers: [],
          threads: [],
        };
      },
      async handleCommand() {
        return createCompletedSessionResult();
      },
    };

    const { lastFrame } = render(<App kernel={kernel} />);
    await waitFor(
      () => (lastFrame() ?? "").includes("Manual recovery required for apply_patch"),
      "expected blocked recovery shell to render",
    );

    const frame = lastFrame();

    expect(frame).toContain("Manual recovery required for apply_patch");
    expect(frame).toContain("uncertain after a");
    expect(frame).toMatch(/Session blocked: manual recovery required/i);
    expect(frame).toMatch(/Inspect the workspace state before continuing/i);
    expect(frame).toMatch(/Input disabled for this thread/i);
  });

  test("reacts to live blocked recovery events without a hydrate refresh", async () => {
    let emit: ((event: Parameters<NonNullable<TuiKernel["events"]["subscribe"]>>[0] extends (event: infer E) => void ? E : never) => void) | undefined;

    const kernel: TuiKernel = {
      events: {
        subscribe(handler) {
          emit = handler;
          return () => undefined;
        },
      },
      async handleCommand() {
        return createCompletedSessionResult();
      },
    };

    const { lastFrame } = render(<App kernel={kernel} />);
    await tick();

    emit?.({
      type: "session.updated",
      payload: {
        status: "blocked",
        threadId: "thread_live_recovery",
        summary: "Manual recovery required from live event.",
        workspaceRoot: "/tmp/workspace",
        projectId: "project-1",
        blockingReason: {
          kind: "human_recovery" as const,
          message: "Manual recovery required from live event.",
        },
        tasks: [
          {
            taskId: "task_live_recovery",
            threadId: "thread_live_recovery",
            status: "blocked",
            summary: "Recover risky patch",
            blockingReason: {
              kind: "human_recovery" as const,
              message: "Manual recovery required from live event.",
            },
          },
        ],
        approvals: [],
        answers: [],
        workers: [],
        threads: [],
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
