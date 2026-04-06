import React from "react";
import { describe, expect, mock, test } from "bun:test";
import { render } from "ink-testing-library";
import { main } from "../../src/app/main";
import { App } from "../../src/interface/tui/app";
import type { TuiKernel } from "../../src/interface/tui/hooks/use-kernel";
import type { ApprovalCommand, PlanInputCommand, SubmitInputCommand, ThreadCommand } from "../../src/interface/tui/commands";
import type { RuntimeSessionState } from "../../src/interface/runtime/runtime-session";
import type { ResolvedSettingsConfig } from "../../src/interface/tui/settings/config-resolver";

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
      messages: [],
      workers: [],
      threads: [],
      ...overrides,
    };
  }

  async function waitFor(check: () => boolean, message: string, attempts = 80, delayMs = 10) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (check()) {
        return;
      }

      await tick(delayMs);
    }

    throw new Error(message);
  }

  async function typeAndSubmit(stdin: { write: (input: string) => void }, text: string) {
    for (const char of text) {
      stdin.write(char);
      await tick();
    }
    await tick();
    stdin.write("\r");
    await tick();
  }

  async function typeText(stdin: { write: (input: string) => void }, text: string) {
    for (const char of text) {
      stdin.write(char);
      await tick();
    }
    await tick();
  }

  async function pressArrowDown(stdin: { write: (input: string) => void }) {
    stdin.write("\u001B[B");
    await tick();
  }

  async function pressArrowUp(stdin: { write: (input: string) => void }) {
    stdin.write("\u001B[A");
    await tick();
  }

  async function pressArrowLeft(stdin: { write: (input: string) => void }) {
    stdin.write("\u001B[D");
    await tick();
  }

  async function pressCtrlJ(stdin: { write: (input: string) => void }) {
    stdin.write("\n");
    await tick();
  }

  async function pressCtrlC(stdin: { write: (input: string) => void }) {
    stdin.write("\u0003");
    await tick();
  }

  function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  function createResolvedSettingsConfig(overrides: Partial<ResolvedSettingsConfig> = {}): ResolvedSettingsConfig {
    return {
      global: {
        autoCompact: true,
        showTips: true,
        reduceMotion: false,
        thinkingMode: true,
        fastMode: false,
        promptSuggestions: true,
        rewindCode: true,
        verboseOutput: false,
        terminalProgressBar: true,
      },
      project: {},
      effective: {
        autoCompact: true,
        showTips: true,
        reduceMotion: false,
        thinkingMode: true,
        fastMode: false,
        promptSuggestions: true,
        rewindCode: true,
        verboseOutput: false,
        terminalProgressBar: true,
      },
      sources: {
        autoCompact: "default",
        showTips: "default",
        reduceMotion: "default",
        thinkingMode: "default",
        fastMode: "default",
        promptSuggestions: "default",
        rewindCode: "default",
        verboseOutput: "default",
        terminalProgressBar: "default",
      },
      ...overrides,
    };
  }

  test.skip("renders the core task shell regions and submits composer input", async () => {
    let receivedCommand: SubmitInputCommand | PlanInputCommand | ApprovalCommand | ThreadCommand | undefined;
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
    await typeText(stdin, "plan the repo");
    await tick();
    stdin.write("\r");
    await waitFor(
      () => receivedCommand?.type === "submit_input" && receivedCommand.payload.text === "plan the repo",
      "expected kernel to receive the full submitted command",
      60,
      10,
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

  test.skip("supports moving the composer cursor and inserting text in the middle of input", async () => {
    let receivedCommand: SubmitInputCommand | PlanInputCommand | ApprovalCommand | ThreadCommand | undefined;
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand(command) {
        receivedCommand = command;
        return createCompletedSessionResult({
          threadId: "thread-edit",
        });
      },
    };

    const { stdin } = render(<App kernel={kernel} />);
    await tick();

    await typeText(stdin, "helo");
    await pressArrowLeft(stdin);
    await pressArrowLeft(stdin);
    await typeText(stdin, "l");
    stdin.write("\r");

    await waitFor(
      () => receivedCommand?.type === "submit_input",
      "expected edited input to submit through the kernel",
    );

    expect(receivedCommand).toEqual({
      type: "submit_input",
      payload: { text: "hello" },
    });
  });

  test.skip("supports multiline composer input via ctrl+j", async () => {
    let receivedCommand: SubmitInputCommand | PlanInputCommand | ApprovalCommand | ThreadCommand | undefined;
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand(command) {
        receivedCommand = command;
        return createCompletedSessionResult({
          threadId: "thread-multiline",
        });
      },
    };

    const { stdin } = render(<App kernel={kernel} />);
    await tick();

    await typeText(stdin, "first line");
    await pressCtrlJ(stdin);
    await typeText(stdin, "second line");
    stdin.write("\r");

    await waitFor(
      () => receivedCommand?.type === "submit_input",
      "expected multiline input to submit through the kernel",
    );

    expect(receivedCommand).toEqual({
      type: "submit_input",
      payload: { text: "first line\nsecond line" },
    });
  });

  test.skip("supports deleting text with backspace before submit", async () => {
    let receivedCommand: SubmitInputCommand | PlanInputCommand | ApprovalCommand | ThreadCommand | undefined;
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand(command) {
        receivedCommand = command;
        return createCompletedSessionResult({
          threadId: "thread-delete",
        });
      },
    };

    const { stdin } = render(<App kernel={kernel} />);
    await tick();

    await typeText(stdin, "hello!");
    stdin.write("\u007F");
    await tick();
    stdin.write("\r");

    await waitFor(
      () => receivedCommand?.type === "submit_input",
      "expected edited input to submit after backspace",
    );

    expect(receivedCommand).toEqual({
      type: "submit_input",
      payload: { text: "hello" },
    });
  });

  test("renders a welcome shell on fresh launch before any thread is created", async () => {
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async hydrateSession() {
        return {
          status: "completed",
          summary: "Previous thread summary should stay out of the main stream on launch.",
          threadId: "thread_previous",
          workspaceRoot: "/tmp/workspace",
          projectId: "project-1",
          narrativeSummary: "Previous thread summary should stay out of the main stream on launch.",
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
      () => (lastFrame() ?? "").includes("Ask openpx... Press / for commands"),
      "expected welcome shell to render on fresh launch",
    );

    const frame = lastFrame();

    expect(frame).toContain("OpenPX");
    expect(frame).toContain("Ask openpx... Press / for commands");
    expect(frame).not.toContain("Fresh launch");
    expect(frame).not.toContain("Quick actions");
    expect(frame).not.toContain("Previous thread summary should stay out of the main stream on launch.");
  });

  test("shows an exit hint on first ctrl+c and exits on the second press", async () => {
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand() {
        return createCompletedSessionResult();
      },
    };

    const exitCalls: number[] = [];
    const exitMock = mock((code?: number) => {
      exitCalls.push(code ?? 0);
      throw new Error("process.exit");
    }) as typeof process.exit;
    const originalExit = process.exit;
    process.exit = exitMock;

    const { lastFrame, stdin } = render(<App kernel={kernel} />);

    try {
      await waitFor(
        () => (lastFrame() ?? "").includes("Ask openpx... Press / for commands"),
        "expected app shell to render before testing ctrl+c",
      );

      await pressCtrlC(stdin);

      await waitFor(
        () => (lastFrame() ?? "").includes("Press Ctrl+C again to exit"),
        "expected first ctrl+c to show exit confirmation text",
      );
      expect(exitCalls).toEqual([]);

      expect(() => stdin.write("\u0003")).toThrow("process.exit");
      await tick();
      expect(exitCalls).toEqual([0]);
    } finally {
      process.exit = originalExit;
    }
  });

  test("does not replay hydrated summary into a fresh launch after the first new message", async () => {
    const receivedCommands: Array<SubmitInputCommand | PlanInputCommand | ApprovalCommand | ThreadCommand> = [];
    let emit: ((event: Parameters<NonNullable<TuiKernel["events"]["subscribe"]>>[0] extends (event: infer E) => void ? E : never) => void) | undefined;
    const kernel: TuiKernel = {
      events: {
        subscribe(handler) {
          emit = handler;
          return () => undefined;
        },
      },
      async hydrateSession() {
        return createCompletedSessionResult({
          threadId: "thread_previous",
          summary: "Old summary from an earlier thread launch.",
          narrativeSummary: "Old summary from an earlier thread launch.",
          answers: [
            {
              answerId: "answer-previous",
              threadId: "thread_previous",
              content: "Old summary from an earlier thread launch.",
            },
          ],
        });
      },
      async handleCommand(command) {
        receivedCommands.push(command);
        if (command.type === "thread_new") {
          return createCompletedSessionResult({
            threadId: "thread_fresh",
          });
        }

        return createCompletedSessionResult({
          threadId: "thread_fresh",
          summary: "Fresh answer for this launch only.",
          answers: [
            {
              answerId: "answer-fresh",
              threadId: "thread_fresh",
              content: "Fresh answer for this launch only.",
            },
          ],
        });
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);

    await waitFor(
      () => (lastFrame() ?? "").includes("Ask openpx... Press / for commands"),
      "expected fresh launch shell before the first message",
    );

    await typeAndSubmit(stdin, "ship it");
    emit?.({
      type: "thread.view_updated",
      payload: {
        threadId: "thread_fresh",
        status: "completed",
        summary: "Fresh answer for this launch only.",
      },
    });
    await waitFor(
      () => (lastFrame() ?? "").includes("Fresh answer for this launch only."),
      "expected the new thread answer to render",
    );

    const frame = lastFrame() ?? "";
    expect(receivedCommands).toEqual([
      { type: "thread_new" },
      { type: "submit_input", payload: { text: "ship it" } },
    ]);
    expect(frame).toContain("Fresh answer for this launch only.");
    expect(frame).not.toContain("Old summary from an earlier thread launch.");
  });

  test("does not flash the previous assistant answer when submitting a second prompt", async () => {
    const receivedCommands: Array<SubmitInputCommand | PlanInputCommand | ApprovalCommand | ThreadCommand> = [];
    let submitCount = 0;
    let emit: ((event: Parameters<NonNullable<TuiKernel["events"]["subscribe"]>>[0] extends (event: infer E) => void ? E : never) => void) | undefined;

    const kernel: TuiKernel = {
      events: {
        subscribe(handler) {
          emit = handler;
          return () => undefined;
        },
      },
      async handleCommand(command) {
        receivedCommands.push(command);

        if (command.type === "thread_new") {
          return createCompletedSessionResult({
            threadId: "thread-repeat",
          });
        }

        submitCount += 1;
        if (submitCount === 1) {
          return createCompletedSessionResult({
            threadId: "thread-repeat",
            summary: "First answer.",
            answers: [
              {
                answerId: "answer-1",
                threadId: "thread-repeat",
                content: "First answer.",
              },
            ],
          });
        }

        return createCompletedSessionResult({
          threadId: "thread-repeat",
          summary: "First answer.",
          answers: [
            {
              answerId: "answer-1",
              threadId: "thread-repeat",
              content: "First answer.",
            },
          ],
          tasks: [
            {
              taskId: "task-2",
              threadId: "thread-repeat",
              status: "running",
              summary: "Working on second answer",
            },
          ],
        });
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);

    await typeAndSubmit(stdin, "first");
    emit?.({
      type: "thread.view_updated",
      payload: {
        threadId: "thread-repeat",
        status: "completed",
        summary: "First answer.",
      },
    });
    await waitFor(
      () => (lastFrame() ?? "").includes("First answer."),
      "expected first answer to render",
    );

    await typeAndSubmit(stdin, "second");
    await tick(30);

    const intermediateFrame = lastFrame() ?? "";
    expect(receivedCommands.filter((command) => command.type === "submit_input")).toHaveLength(2);
    expect(intermediateFrame).toContain("Working on second answer");
    expect(intermediateFrame.split("First answer.")).toHaveLength(2);

    emit?.({
      type: "thread.view_updated",
      payload: {
        threadId: "thread-repeat",
        status: "completed",
        summary: "Second answer.",
      },
    });
    await waitFor(
      () => (lastFrame() ?? "").includes("Second answer."),
      "expected final second answer to replace the in-flight state",
    );
  });

  test("clears running task loading once the thread view reports completion", async () => {
    let eventHandler: ((event: Parameters<TuiKernel["events"]["subscribe"]>[0] extends (event: infer TEvent) => void ? TEvent : never) => void) | undefined;
    const kernel: TuiKernel = {
      events: {
        subscribe(handler) {
          eventHandler = handler;
          return () => {
            eventHandler = undefined;
          };
        },
      },
      async handleCommand() {
        return createCompletedSessionResult({
          threadId: "thread_1",
        });
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);
    await tick(80);

    await typeAndSubmit(stdin, "start");
    await waitFor(
      () => !(lastFrame() ?? "").includes("OpenPX"),
      "expected first submission to leave the welcome shell",
    );

    eventHandler?.({
      type: "session.updated",
      payload: createCompletedSessionResult({
        threadId: "thread_1",
        tasks: [
          {
            taskId: "task_running",
            threadId: "thread_1",
            status: "running",
            summary: "Generating answer",
          },
        ],
      }),
    });
    await waitFor(
      () => (lastFrame() ?? "").includes("Generating answer"),
      "expected running task indicator while the task is active",
    );

    eventHandler?.({
      type: "thread.view_updated",
      payload: {
        status: "completed",
        threadId: "thread_1",
        summary: "Done.",
        tasks: [
          {
            taskId: "task_running",
            threadId: "thread_1",
            status: "completed",
            summary: "Generating answer",
          },
        ],
        approvals: [],
        workspaceRoot: "/tmp/workspace",
        projectId: "project-1",
        threads: [],
      },
    });
    eventHandler?.({ type: "model.status", payload: { status: "idle" } });
    await tick(30);

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Done.");
    expect(frame).not.toContain("Generating answer");
  });

  test("creates a new thread before submitting the first input of this launch", async () => {
    const receivedCommands: Array<SubmitInputCommand | PlanInputCommand | ApprovalCommand | ThreadCommand> = [];
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand(command) {
        receivedCommands.push(command);
        if (command.type === "thread_new") {
          return createCompletedSessionResult({
            threadId: "thread_new_launch",
          });
        }
        return createCompletedSessionResult({
          threadId: "thread_new_launch",
        });
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);

    await tick();
    stdin.write("plan the repo");
    await waitFor(
      () => (lastFrame() ?? "").includes("plan the repo"),
      "expected composer to render the first input before submit",
    );
    stdin.write("\r");
    await waitFor(
      () => receivedCommands.length === 2,
      "expected first-launch submission to issue thread_new and then submit_input",
    );

    expect(receivedCommands).toEqual([
      { type: "thread_new" },
      {
        type: "submit_input",
        payload: { text: "plan the repo" },
      },
    ]);
  });

  test("shows a local sessions pane without mutating runtime state", async () => {
    const receivedCommands: Array<SubmitInputCommand | PlanInputCommand | ApprovalCommand | ThreadCommand> = [];
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async hydrateSession() {
        return createCompletedSessionResult({
          threadId: "thread-active",
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
        });
      },
      async handleCommand(command) {
        receivedCommands.push(command);
        return createCompletedSessionResult();
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);
    await waitFor(
      () => (lastFrame() ?? "").includes("OpenPX"),
      "expected welcome shell before opening sessions pane",
    );

    await typeAndSubmit(stdin, "/sessions");
    await waitFor(
      () => (lastFrame() ?? "").includes("thread-blocked"),
      "expected sessions utility pane to render local thread summaries",
      60,
    );

    const frame = lastFrame();
    expect(frame).toContain("sessions");
    expect(frame).toContain("esc to close");
    expect(frame).toContain("thread-active (active) [active] approval:1 Current active runtime recovery thread.");
    expect(frame).toContain("thread-blocked [blocked] human_recovery Manual recovery pending for a risky patch.");
    expect(receivedCommands).toHaveLength(0);
  });

  test("allows selecting a session from /sessions and switching to it", async () => {
    const receivedCommands: Array<SubmitInputCommand | PlanInputCommand | ApprovalCommand | ThreadCommand> = [];
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async hydrateSession() {
        return createCompletedSessionResult({
          threadId: "thread-active",
          threads: [
            {
              threadId: "thread-active",
              workspaceRoot: "/tmp/workspace",
              projectId: "project-1",
              revision: 4,
              status: "completed",
              narrativeSummary: "Current thread",
            },
            {
              threadId: "thread-target",
              workspaceRoot: "/tmp/workspace",
              projectId: "project-1",
              revision: 3,
              status: "completed",
              narrativeSummary: "Target thread",
            },
          ],
        });
      },
      async handleCommand(command) {
        receivedCommands.push(command);
        if (command.type === "thread_switch") {
          return createCompletedSessionResult({
            threadId: command.payload.threadId,
            summary: "Target thread latest answer.",
            messages: [
              {
                messageId: "message-target-1",
                threadId: "thread-target",
                role: "user",
                content: "Earlier question from the target thread.",
              },
              {
                messageId: "message-target-2",
                threadId: "thread-target",
                role: "assistant",
                content: "Earlier answer from the target thread.",
              },
              {
                messageId: "message-target-3",
                threadId: "thread-target",
                role: "user",
                content: "Latest follow-up from the target thread.",
              },
              {
                messageId: "message-target-4",
                threadId: "thread-target",
                role: "assistant",
                content: "Target thread latest answer.",
              },
            ],
            answers: [
              {
                answerId: "answer-target",
                threadId: "thread-target",
                content: "Target thread latest answer.",
              },
            ],
            narrativeSummary: "Target thread",
            threads: [
              {
                threadId: "thread-active",
                workspaceRoot: "/tmp/workspace",
                projectId: "project-1",
                revision: 4,
                status: "completed",
                narrativeSummary: "Current thread",
              },
              {
                threadId: "thread-target",
                workspaceRoot: "/tmp/workspace",
                projectId: "project-1",
                revision: 3,
                status: "completed",
                narrativeSummary: "Target thread",
              },
            ],
          });
        }

        return createCompletedSessionResult();
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);
    await waitFor(
      () => (lastFrame() ?? "").includes("OpenPX"),
      "expected welcome shell before opening sessions pane",
    );

    await typeAndSubmit(stdin, "/sessions");
    await waitFor(
      () => (lastFrame() ?? "").includes("thread-target"),
      "expected sessions pane to render selectable threads",
      60,
    );

    await pressArrowDown(stdin);
    stdin.write("\r");

    await waitFor(
      () => receivedCommands.some((command) => command.type === "thread_switch"),
      "expected enter to switch to the selected thread",
      60,
    );

    expect(receivedCommands).toContainEqual({
      type: "thread_switch",
      payload: { threadId: "thread-target" },
    });
    await waitFor(
      () => !(lastFrame() ?? "").includes("esc to close"),
      "expected sessions pane to close after switching threads",
      60,
    );
    expect(lastFrame()).toContain("Earlier question from the target thread.");
    expect(lastFrame()).toContain("Earlier answer from the target thread.");
    expect(lastFrame()).toContain("Latest follow-up from the target thread.");
    expect(lastFrame()).toContain("Target thread latest answer.");
  });

  test("supports wrap-around and vim-style navigation in /sessions", async () => {
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async hydrateSession() {
        return createCompletedSessionResult({
          threadId: "thread-active",
          threads: [
            {
              threadId: "thread-active",
              workspaceRoot: "/tmp/workspace",
              projectId: "project-1",
              revision: 4,
              status: "completed",
              narrativeSummary: "Current thread",
            },
            {
              threadId: "thread-middle",
              workspaceRoot: "/tmp/workspace",
              projectId: "project-1",
              revision: 3,
              status: "completed",
              narrativeSummary: "Middle thread",
            },
            {
              threadId: "thread-oldest",
              workspaceRoot: "/tmp/workspace",
              projectId: "project-1",
              revision: 2,
              status: "completed",
              narrativeSummary: "Oldest thread",
            },
          ],
        });
      },
      async handleCommand() {
        return createCompletedSessionResult();
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);
    await waitFor(
      () => (lastFrame() ?? "").includes("OpenPX"),
      "expected welcome shell before opening sessions pane",
    );

    await typeAndSubmit(stdin, "/sessions");
    await waitFor(
      () => (lastFrame() ?? "").includes("thread-oldest"),
      "expected sessions pane to list all scoped threads",
      60,
    );

    expect(lastFrame()).toContain("❯ thread-active (active) [completed] Current thread");

    await pressArrowUp(stdin);
    await waitFor(
      () => (lastFrame() ?? "").includes("❯ thread-oldest [completed] Oldest thread"),
      "expected up arrow on the first item to wrap to the last thread",
      60,
    );

    stdin.write("k");
    await waitFor(
      () => (lastFrame() ?? "").includes("❯ thread-middle [completed] Middle thread"),
      "expected vim-style k navigation to move upward in the sessions list",
      60,
    );

    stdin.write("j");
    await waitFor(
      () => (lastFrame() ?? "").includes("❯ thread-oldest [completed] Oldest thread"),
      "expected vim-style j navigation to move downward in the sessions list",
      60,
    );
  });

  test("shows a local history pane and clear resets transient ui state", async () => {
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async hydrateSession() {
        return createCompletedSessionResult({
          threadId: "thread-history",
          answers: [
            {
              answerId: "answer-1",
              threadId: "thread-history",
              content: "Most recent answer from the current thread.",
            },
          ],
          narrativeSummary: "Fallback narrative summary.",
        });
      },
      async handleCommand() {
        return createCompletedSessionResult();
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);
    await waitFor(
      () => (lastFrame() ?? "").includes("OpenPX"),
      "expected welcome shell before opening sessions pane",
    );

    await typeAndSubmit(stdin, "/history");
    await waitFor(
      () => (lastFrame() ?? "").includes("Most recent answer from the current thread."),
      "expected history utility pane to render current-thread answer content",
      60,
    );

    expect(lastFrame()).toContain("history");
    expect(lastFrame()).toContain("esc to close");
    expect(lastFrame()).toContain("Most recent answer from the current thread.");

    await typeAndSubmit(stdin, "/clear");
    await waitFor(
      () => !(lastFrame() ?? "").includes("Most recent answer from the current thread."),
      "expected clear to dismiss utility pane content",
      60,
    );

    expect(lastFrame()).toContain("OpenPX");
  });

  test("shows a scroll indicator when the interaction stream overflows the viewport", async () => {
    let emit: ((event: Parameters<NonNullable<TuiKernel["events"]["subscribe"]>>[0] extends (event: infer E) => void ? E : never) => void) | undefined;
    let turn = 0;

    const kernel: TuiKernel = {
      events: {
        subscribe(handler) {
          emit = handler;
          return () => undefined;
        },
      },
      async handleCommand(command) {
        if (command.type === "thread_new") {
          return createCompletedSessionResult({ threadId: "thread-overflow" });
        }

        turn += 1;
        return createCompletedSessionResult({ threadId: "thread-overflow" });
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);

    for (let index = 0; index < 10; index += 1) {
      await typeAndSubmit(stdin, `message ${index + 1}`);
      emit?.({
        type: "thread.view_updated",
        payload: {
          threadId: "thread-overflow",
          status: "completed",
          summary: `response ${index + 1}`,
        },
      });
      await tick(10);
    }

    await waitFor(
      () => (lastFrame() ?? "").includes("history ↑"),
      "expected an overflow indicator once the message stream exceeds the viewport",
      60,
    );
  });

  test("supports paging the interaction stream upward and back down", async () => {
    let emit: ((event: Parameters<NonNullable<TuiKernel["events"]["subscribe"]>>[0] extends (event: infer E) => void ? E : never) => void) | undefined;

    const kernel: TuiKernel = {
      events: {
        subscribe(handler) {
          emit = handler;
          return () => undefined;
        },
      },
      async handleCommand(command) {
        if (command.type === "thread_new") {
          return createCompletedSessionResult({ threadId: "thread-scroll" });
        }

        return createCompletedSessionResult({ threadId: "thread-scroll" });
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);

    for (let index = 0; index < 10; index += 1) {
      await typeAndSubmit(stdin, `message ${index + 1}`);
      emit?.({
        type: "thread.view_updated",
        payload: {
          threadId: "thread-scroll",
          status: "completed",
          summary: `response ${index + 1}`,
        },
      });
      await tick(10);
    }

    await waitFor(
      () => (lastFrame() ?? "").includes("history ↑"),
      "expected the stream to be scrollable before paging",
      60,
    );

    stdin.write("\u001B[5~");
    await waitFor(
      () => (lastFrame() ?? "").includes("live ↓"),
      "expected page up to move the viewport away from the live bottom",
      60,
    );

    const pagedFrame = lastFrame() ?? "";
    expect(pagedFrame).toContain("response 7");

    stdin.write("\u001B[6~");
    await waitFor(
      () => !(lastFrame() ?? "").includes("live ↓"),
      "expected page down to return to the latest messages",
      60,
    );
  });

  test("shows local help and settings panes without creating a thread", async () => {
    let commandCount = 0;
    const settingsStore = {
      async readResolved() {
        return {
          ...createResolvedSettingsConfig(),
          paths: {
            global: "/tmp/home/.openpx/config.json",
            project: "/tmp/workspace/.openpx/config.json",
          },
        };
      },
      async writeGlobal() {},
      async writeProject() {
        throw new Error("project config should not be written in this test");
      },
    };
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand() {
        commandCount += 1;
        return createCompletedSessionResult();
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} settingsStore={settingsStore} />);
    await tick();

    await typeAndSubmit(stdin, "/help");
    await waitFor(
      () => (lastFrame() ?? "").includes("/new"),
      "expected help pane to render slash command guidance",
      60,
    );
    expect(lastFrame()).toContain("/settings");

    await typeAndSubmit(stdin, "/settings");
    await waitFor(
      () => (lastFrame() ?? "").includes("Status   [Config]   Usage"),
      "expected settings pane to render interactive tabs",
      60,
    );

    expect(lastFrame()).toContain("Auto-compact");
    expect(commandCount).toBe(0);
  });

  test("renders the settings pane below the main stream instead of above it", async () => {
    const settingsStore = {
      async readResolved() {
        return {
          ...createResolvedSettingsConfig(),
          paths: {
            global: "/tmp/home/.openpx/config.json",
            project: "/tmp/workspace/.openpx/config.json",
          },
        };
      },
      async writeGlobal() {},
      async writeProject() {},
    };

    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand() {
        return createCompletedSessionResult();
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} settingsStore={settingsStore} />);
    await waitFor(
      () => (lastFrame() ?? "").includes("OpenPX"),
      "expected welcome shell before opening settings pane",
    );

    await typeAndSubmit(stdin, "/settings");
    await waitFor(
      () => (lastFrame() ?? "").includes("Status   [Config]   Usage"),
      "expected settings pane to open",
      60,
    );

    const frame = lastFrame() ?? "";
    expect(frame.indexOf("OpenPX")).toBeLessThan(frame.indexOf("Status   [Config]   Usage"));
  });

  test("settings pane can switch to project scope and close with escape without interrupting the runtime", async () => {
    let interruptCount = 0;
    const settingsStore = {
      async readResolved() {
        return {
          ...createResolvedSettingsConfig({
            sources: {
              autoCompact: "project",
              showTips: "global",
              reduceMotion: "default",
              thinkingMode: "default",
              fastMode: "default",
              promptSuggestions: "default",
              rewindCode: "default",
              verboseOutput: "default",
              terminalProgressBar: "default",
            },
            project: {
              autoCompact: false,
            },
            effective: {
              autoCompact: false,
              showTips: true,
              reduceMotion: false,
              thinkingMode: true,
              fastMode: false,
              promptSuggestions: true,
              rewindCode: true,
              verboseOutput: false,
              terminalProgressBar: true,
            },
          }),
          paths: {
            global: "/tmp/home/.openpx/config.json",
            project: "/tmp/workspace/.openpx/config.json",
          },
        };
      },
      async writeGlobal() {
        throw new Error("global config should not be written in this test");
      },
      async writeProject() {},
    };
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand() {
        return createCompletedSessionResult();
      },
      async interruptCurrentThread() {
        interruptCount += 1;
        return createCompletedSessionResult();
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} settingsStore={settingsStore} />);
    await typeAndSubmit(stdin, "/settings");
    await waitFor(
      () => (lastFrame() ?? "").includes("Auto-compact"),
      "expected settings pane to open",
      60,
    );

    stdin.write("\u001B");
    await waitFor(
      () => !(lastFrame() ?? "").includes("Status   [Config]   Usage"),
      "expected escape to close settings without interrupting the runtime",
      60,
    );

    expect(interruptCount).toBe(0);
  });

  test("opens slash command suggestions under the composer and closes them with escape", async () => {
    let interruptCount = 0;
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand() {
        return createCompletedSessionResult();
      },
      async interruptCurrentThread() {
        interruptCount += 1;
        return createCompletedSessionResult();
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);
    await typeText(stdin, "/");
    await waitFor(
      () => (lastFrame() ?? "").includes("/plan"),
      "expected slash suggestions to open under the composer",
      60,
    );

    stdin.write("\u001B");
    await waitFor(
      () => !(lastFrame() ?? "").includes("/plan"),
      "expected escape to close slash suggestions without interrupting the thread",
      60,
    );

    expect(interruptCount).toBe(0);
  });

  test("filters slash suggestions and selecting /plan completes the composer input", async () => {
    let commandCount = 0;
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand() {
        commandCount += 1;
        return createCompletedSessionResult();
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);
    await typeText(stdin, "/pl");
    await waitFor(
      () => (lastFrame() ?? "").includes("/plan"),
      "expected filtered slash suggestions for /pl",
      60,
    );

    stdin.write("\r");
    await waitFor(
      () => (lastFrame() ?? "").includes("/plan "),
      "expected selecting /plan to complete the composer input",
      60,
    );

    expect(commandCount).toBe(0);
  });

  test("can execute immediate slash commands from the suggestion list", async () => {
    const receivedCommands: Array<SubmitInputCommand | PlanInputCommand | ApprovalCommand | ThreadCommand> = [];
    const settingsStore = {
      async readResolved() {
        return {
          ...createResolvedSettingsConfig(),
          paths: {
            global: "/tmp/home/.openpx/config.json",
            project: "/tmp/workspace/.openpx/config.json",
          },
        };
      },
      async writeGlobal() {},
      async writeProject() {},
    };
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand(command) {
        receivedCommands.push(command);
        return createCompletedSessionResult();
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} settingsStore={settingsStore} />);
    await typeText(stdin, "/se");
    await waitFor(
      () => (lastFrame() ?? "").includes("/sessions") && (lastFrame() ?? "").includes("/settings"),
      "expected /se to filter down to sessions and settings suggestions",
      60,
    );

    stdin.write("\r");
    await waitFor(
      () => (lastFrame() ?? "").includes("sessions"),
      "expected the default immediate slash command selection to execute /sessions",
      60,
    );

    expect(receivedCommands).toHaveLength(0);
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

  test("keeps hydrated approval state out of the main stream until this launch creates a thread", async () => {
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
      () => (lastFrame() ?? "").includes("OpenPX"),
      "expected welcome shell to render before showing hydrated approval state",
    );

    const frame = lastFrame();

    expect(frame).toContain("OpenPX");
    expect(frame).not.toContain("Approval required before deleting src/resume-me.ts");
    expect(frame).not.toContain("apply_patch delete_file src/resume-me.ts");
  });

  test("keeps hydrated narrative summaries out of the launch welcome shell", async () => {
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
      () => (lastFrame() ?? "").includes("OpenPX"),
      "expected welcome shell to render before narrative fallback",
    );

    const frame = lastFrame();

    expect(frame).toContain("OpenPX");
    expect(frame).not.toContain("Completed repo scan and isolated runtime recovery work.");
  });

  test("keeps the thread panel hidden by default on the welcome shell", async () => {
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
      () => (lastFrame() ?? "").includes("OpenPX"),
      "expected welcome shell to render before checking panel visibility",
    );

    const frame = lastFrame();

    expect(frame).toContain("OpenPX");
    expect(frame).not.toContain("THREADS");
    expect(frame).not.toContain("thread-blocked");
  });

  test("keeps hydrated manual-recovery state out of the launch welcome shell", async () => {
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
      () => (lastFrame() ?? "").includes("OpenPX"),
      "expected welcome shell to render before blocked recovery shell",
    );

    const frame = lastFrame();

    expect(frame).toContain("OpenPX");
    expect(frame).not.toContain("Manual recovery required for apply_patch");
    expect(frame).not.toMatch(/Input disabled for this thread/i);
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

    const { lastFrame, stdin } = render(<App kernel={kernel} />);
    await tick();
    stdin.write("start work");
    await tick();
    stdin.write("\r");
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
    expect(frame).toContain("stage:blocked");
  });

  test("shows the planning stage while a planning task is being submitted", async () => {
    const deferred = createDeferred<RuntimeSessionState>();
    const receivedCommands: Array<SubmitInputCommand | PlanInputCommand | ApprovalCommand | ThreadCommand> = [];
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand(command) {
        receivedCommands.push(command);
        if (command.type === "thread_new") {
          return createCompletedSessionResult({
            threadId: "thread-planning",
          });
        }

        return deferred.promise;
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);
    await typeAndSubmit(stdin, "/plan design the rollout");
    await waitFor(
      () => (lastFrame() ?? "").includes("stage:plan"),
      "expected planning submissions to render a planning stage",
      60,
    );
    await waitFor(
      () => receivedCommands.length === 2,
      "expected planning submission command to reach the kernel",
      60,
    );

    expect(receivedCommands).toEqual([
      { type: "thread_new" },
      {
        type: "plan_input",
        payload: { text: "design the rollout" },
      },
    ]);

    deferred.resolve(createCompletedSessionResult({
      threadId: "thread-planning",
    }));
    await tick();
  });

  test("shows executing and awaiting confirmation stages in the shell chrome", async () => {
    const deferred = createDeferred<RuntimeSessionState>();
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand(command) {
        if (command.type === "thread_new") {
          return createCompletedSessionResult({
            threadId: "thread-executing",
          });
        }

        return deferred.promise;
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);
    await typeAndSubmit(stdin, "implement the shell");
    await waitFor(
      () => (lastFrame() ?? "").includes("stage:run"),
      "expected ordinary submissions to render an executing stage",
      60,
    );

    deferred.resolve(createCompletedSessionResult({
      status: "waiting_approval",
      threadId: "thread-executing",
      summary: "Need confirmation before applying the patch",
      blockingReason: {
        kind: "waiting_approval",
        message: "apply_patch update_file src/interface/tui/app.tsx",
      },
      tasks: [
        {
          taskId: "task-stage",
          threadId: "thread-executing",
          status: "blocked",
          summary: "Apply shell patch",
          blockingReason: {
            kind: "waiting_approval",
            message: "apply_patch update_file src/interface/tui/app.tsx",
          },
        },
      ],
      approvals: [
        {
          approvalRequestId: "approval-stage",
          threadId: "thread-executing",
          taskId: "task-stage",
          toolCallId: "tool-stage",
          summary: "apply_patch update_file src/interface/tui/app.tsx",
          risk: "apply_patch.update_file",
          status: "pending",
        },
      ],
      answers: [],
      workers: [],
      threads: [],
    }));

    await waitFor(
      () => (lastFrame() ?? "").includes("stage:confirm"),
      "expected approval state to render an awaiting confirmation stage",
      60,
    );
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

  test("pressing escape interrupts the current thread through the kernel api", async () => {
    let interruptCount = 0;
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async hydrateSession() {
        return createCompletedSessionResult({
          threadId: "thread-active",
        });
      },
      async handleCommand() {
        return createCompletedSessionResult({
          threadId: "thread-active",
        });
      },
      async interruptCurrentThread() {
        interruptCount += 1;
        return createCompletedSessionResult({
          threadId: "thread-active",
        });
      },
    };

    const { stdin } = render(<App kernel={kernel} />);
    await tick(70);
    stdin.write("\u001B");
    await tick();

    expect(interruptCount).toBe(1);
  });

  test("pressing escape keeps the streamed reply instead of reverting to the previous answer", async () => {
    let interruptCount = 0;
    let emit: ((event: Parameters<NonNullable<TuiKernel["events"]["subscribe"]>>[0] extends (event: infer E) => void ? E : never) => void) | undefined;

    const kernel: TuiKernel = {
      events: {
        subscribe(handler) {
          emit = handler;
          return () => undefined;
        },
      },
      async hydrateSession() {
        return createCompletedSessionResult({
          threadId: "thread-active",
        });
      },
      async handleCommand(command) {
        if (command.type === "thread_new") {
          return createCompletedSessionResult({
            threadId: "thread-active",
          });
        }

        return createCompletedSessionResult({
          threadId: "thread-active",
          summary: "First answer.",
          answers: [
            {
              answerId: "answer-1",
              threadId: "thread-active",
              content: "First answer.",
            },
          ],
        });
      },
      async interruptCurrentThread() {
        interruptCount += 1;
        return createCompletedSessionResult({
          threadId: "thread-active",
          summary: "First answer.",
          answers: [
            {
              answerId: "answer-1",
              threadId: "thread-active",
              content: "First answer.",
            },
          ],
        });
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);

    await typeAndSubmit(stdin, "first");
    emit?.({
      type: "thread.view_updated",
      payload: {
        threadId: "thread-active",
        status: "completed",
        summary: "First answer.",
      },
    });
    await waitFor(
      () => (lastFrame() ?? "").includes("First answer."),
      "expected first answer to render",
    );

    await typeAndSubmit(stdin, "second");
    emit?.({ type: "stream.text_chunk", payload: { content: "Partial second answer", index: 0 } });
    await waitFor(
      () => (lastFrame() ?? "").includes("Partial second answer"),
      "expected streamed follow-up text before interrupt",
    );

    stdin.write("\u001B");
    await tick(20);

    const frame = lastFrame() ?? "";
    expect(interruptCount).toBe(1);
    expect(frame).toContain("Partial second answer");
  });

  test("does not emit duplicate assistant key warnings when timestamps collide", async () => {
    let emit: ((event: Parameters<NonNullable<TuiKernel["events"]["subscribe"]>>[0] extends (event: infer E) => void ? E : never) => void) | undefined;
    const originalNow = Date.now;
    const originalConsoleError = console.error;
    const consoleMessages: string[] = [];

    Date.now = () => 1_700_000_000_000;
    console.error = (...args: unknown[]) => {
      consoleMessages.push(args.map(String).join(" "));
    };

    try {
      const kernel: TuiKernel = {
        events: {
          subscribe(handler) {
            emit = handler;
            return () => undefined;
          },
        },
        async handleCommand() {
          return createCompletedSessionResult({
            threadId: "thread-collision",
          });
        },
      };

      render(<App kernel={kernel} />);
      await tick();

      emit?.({
        type: "session.updated",
        payload: createCompletedSessionResult({
          threadId: "thread-collision",
        }),
      });
      await tick();

      emit?.({
        type: "thread.view_updated",
        payload: {
          threadId: "thread-collision",
          status: "completed",
          summary: "First assistant summary",
        },
      });
      await tick();

      emit?.({
        type: "thread.view_updated",
        payload: {
          threadId: "thread-collision",
          status: "completed",
          summary: "Second assistant summary",
        },
      });
      await tick();

      expect(consoleMessages.some((message) => message.includes("same key"))).toBe(false);
    } finally {
      Date.now = originalNow;
      console.error = originalConsoleError;
    }
  });

  test("renders assistant reasoning with a quieter label and inline status copy", async () => {
    let emit: ((event: Parameters<NonNullable<TuiKernel["events"]["subscribe"]>>[0] extends (event: infer E) => void ? E : never) => void) | undefined;

    const kernel: TuiKernel = {
      events: {
        subscribe(handler) {
          emit = handler;
          return () => undefined;
        },
      },
      async handleCommand() {
        return createCompletedSessionResult({
          threadId: "thread-reasoning",
        });
      },
    };

    const { lastFrame, stdin } = render(<App kernel={kernel} />);
    await typeAndSubmit(stdin, "start");

    emit?.({ type: "stream.thinking_started", payload: { model: "test-model" } });
    emit?.({ type: "stream.thinking_chunk", payload: { content: "Checking context." } });
    emit?.({ type: "stream.text_chunk", payload: { content: "Final answer.", index: 0 } });
    emit?.({ type: "model.status", payload: { status: "responding" } });
    await tick(30);

    const frame = lastFrame() ?? "";
    expect(frame).toContain("reasoning");
    expect(frame).toContain("assistant");
    expect(frame).toContain("responding");
    expect(frame).not.toContain("Responding...");
  });

  test("renders the status bar as compressed shell metadata", async () => {
    const kernel: TuiKernel = {
      events: {
        subscribe() {
          return () => undefined;
        },
      },
      async handleCommand() {
        return createCompletedSessionResult();
      },
    };

    const { lastFrame } = render(<App kernel={kernel} />);
    await tick();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("mode:默认");
    expect(frame).toContain("stage:idle");
    expect(frame).not.toContain("推理:默认");
    expect(frame).not.toContain("状态:idle");
  });
});
