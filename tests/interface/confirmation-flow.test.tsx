import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { App } from "../../src/interface/tui/app";
import type { TuiKernel } from "../../src/interface/tui/hooks/use-kernel";
import type { ApprovalCommand, PlanInputCommand, SubmitInputCommand, ThreadCommand } from "../../src/interface/tui/commands";

describe("Confirmation Flow", () => {
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

  async function typeAndSubmit(stdin: { write: (input: string) => void }, text: string) {
    for (const char of text) {
      stdin.write(char);
      await tick();
    }
    await tick();
    stdin.write("\r");
    await tick();
  }

  test("shows the approval confirmation shell after plan-style work is submitted", async () => {
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
              runId: "run-1",
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
              runId: "run-1",
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
    
    await typeAndSubmit(stdin, "new task");
    
    await waitFor(() => commandCalled, "handleCommand not called", 100);
    await waitFor(
      () => (lastFrame() ?? "").includes("Confirm work?"),
      "expected confirmation prompt to appear",
      50,
    );
    
    expect(lastFrame()).toContain("Confirm work?");
  });

  const variants = [
    { text: "yes", expected: "approve_request" },
    { text: "y", expected: "approve_request" },
    { text: "可以", expected: "approve_request" },
    { text: "no", expected: "reject_request" },
    { text: "n", expected: "reject_request" },
    { text: "不行", expected: "reject_request" },
  ] as const;

  for (const variant of variants) {
    test(`maps approval input '${variant.text}' to ${variant.expected}`, async () => {
      const receivedCommands: Array<SubmitInputCommand | PlanInputCommand | ApprovalCommand | ThreadCommand> = [];
      const kernel: TuiKernel = {
        events: {
          subscribe() {
            return () => undefined;
          },
        },
        async handleCommand(command) {
          receivedCommands.push(command);
          return {
            status: "waiting_approval",
            threadId: "thread-1",
            workspaceRoot: "/tmp/workspace",
            projectId: "project-1",
            summary: "Approval required",
            blockingReason: {
              kind: "waiting_approval" as const,
              message: "Approval required",
            },
            tasks: [],
            approvals: [
              {
                approvalRequestId: "approval-1",
                threadId: "thread-1",
                runId: "run-1",
                taskId: "t1",
                toolCallId: "tool-1",
                summary: "Approval required",
                risk: "team.start",
                status: "pending",
              },
            ],
            answers: [],
            workers: [],
            threads: [],
          };
        },
        async hydrateSession() {
          return {
            status: "waiting_approval",
            threadId: "thread-1",
            workspaceRoot: "/tmp/workspace",
            projectId: "project-1",
            summary: "Approval required",
            blockingReason: {
              kind: "waiting_approval" as const,
              message: "Approval required",
            },
            tasks: [],
            approvals: [
              {
                approvalRequestId: "approval-1",
                threadId: "thread-1",
                runId: "run-1",
                taskId: "t1",
                toolCallId: "tool-1",
                summary: "Approval required",
                risk: "team.start",
                status: "pending",
              },
            ],
            answers: [],
            workers: [],
            threads: [],
          };
        },
      };

      const { stdin, lastFrame, unmount } = render(<App kernel={kernel} />);
      await waitFor(
        () => (lastFrame() ?? "").includes("Confirm work?"),
        "expected confirmation prompt before typing approval variant",
        100,
      );
      await typeAndSubmit(stdin, variant.text);
      await waitFor(
        () => receivedCommands.some((command) => command.type === variant.expected),
        `expected ${variant.text} to map to ${variant.expected}`,
        100,
      );
      expect(receivedCommands.some((command) => command.type === variant.expected)).toBe(true);
      unmount();
    });
  }
});
