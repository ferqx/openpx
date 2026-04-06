import type { RuntimeSessionState } from "../runtime/runtime-session";

type SessionThreadSummary = RuntimeSessionState["threads"][number];

export type InputKeyState = {
  downArrow: boolean;
  upArrow: boolean;
  home: boolean;
  end: boolean;
  return: boolean;
  pageUp: boolean;
  pageDown: boolean;
  ctrl: boolean;
};

export type SessionsPaneAction =
  | { kind: "select"; index: number }
  | { kind: "switch"; threadId: string }
  | { kind: "noop" };

export function resolveSessionsPaneAction(input: {
  keyValue: string;
  key: Pick<InputKeyState, "downArrow" | "upArrow" | "home" | "end" | "return">;
  selectedIndex: number;
  threads: SessionThreadSummary[];
}): SessionsPaneAction {
  if (input.threads.length === 0) {
    return { kind: "noop" };
  }

  if (input.key.downArrow || input.keyValue === "j") {
    return {
      kind: "select",
      index: (input.selectedIndex + 1) % input.threads.length,
    };
  }

  if (input.key.upArrow || input.keyValue === "k") {
    return {
      kind: "select",
      index: (input.selectedIndex - 1 + input.threads.length) % input.threads.length,
    };
  }

  if (input.key.home) {
    return { kind: "select", index: 0 };
  }

  if (input.key.end) {
    return { kind: "select", index: input.threads.length - 1 };
  }

  if (input.key.return) {
    const selectedThread = input.threads[input.selectedIndex] ?? input.threads[0];
    if (!selectedThread) {
      return { kind: "noop" };
    }

    return {
      kind: "switch",
      threadId: selectedThread.threadId,
    };
  }

  return { kind: "noop" };
}

export function resolveStreamScrollDelta(key: Pick<InputKeyState, "pageUp" | "pageDown">): number {
  if (key.pageUp) {
    return 3;
  }

  if (key.pageDown) {
    return -3;
  }

  return 0;
}

export function isThreadPanelToggle(input: { keyValue: string; key: Pick<InputKeyState, "ctrl"> }): boolean {
  return input.key.ctrl && input.keyValue === "t";
}
