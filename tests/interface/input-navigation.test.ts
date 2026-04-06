import { describe, expect, test } from "bun:test";
import {
  isThreadPanelToggle,
  resolveSessionsPaneAction,
  resolveStreamScrollDelta,
  type InputKeyState,
} from "../../src/interface/tui/input-navigation";

const baseKeyState: InputKeyState = {
  downArrow: false,
  upArrow: false,
  home: false,
  end: false,
  return: false,
  pageUp: false,
  pageDown: false,
  ctrl: false,
};

const threads = [
  {
    threadId: "thread-1",
    workspaceRoot: "/tmp/workspace",
    projectId: "project-1",
    revision: 1,
    status: "active" as const,
  },
  {
    threadId: "thread-2",
    workspaceRoot: "/tmp/workspace",
    projectId: "project-1",
    revision: 2,
    status: "completed" as const,
  },
];

describe("input navigation", () => {
  test("supports wrap-around and direct selection in sessions pane", () => {
    expect(
      resolveSessionsPaneAction({
        keyValue: "j",
        key: baseKeyState,
        selectedIndex: 1,
        threads,
      }),
    ).toEqual({ kind: "select", index: 0 });

    expect(
      resolveSessionsPaneAction({
        keyValue: "k",
        key: baseKeyState,
        selectedIndex: 0,
        threads,
      }),
    ).toEqual({ kind: "select", index: 1 });

    expect(
      resolveSessionsPaneAction({
        keyValue: "",
        key: { ...baseKeyState, home: true },
        selectedIndex: 1,
        threads,
      }),
    ).toEqual({ kind: "select", index: 0 });

    expect(
      resolveSessionsPaneAction({
        keyValue: "",
        key: { ...baseKeyState, end: true },
        selectedIndex: 0,
        threads,
      }),
    ).toEqual({ kind: "select", index: 1 });
  });

  test("returns a switch action for enter in sessions pane", () => {
    expect(
      resolveSessionsPaneAction({
        keyValue: "",
        key: { ...baseKeyState, return: true },
        selectedIndex: 1,
        threads,
      }),
    ).toEqual({ kind: "switch", threadId: "thread-2" });
  });

  test("computes stream scroll deltas and thread toggle shortcuts", () => {
    expect(resolveStreamScrollDelta({ pageUp: true, pageDown: false })).toBe(3);
    expect(resolveStreamScrollDelta({ pageUp: false, pageDown: true })).toBe(-3);
    expect(resolveStreamScrollDelta({ pageUp: false, pageDown: false })).toBe(0);

    expect(isThreadPanelToggle({ keyValue: "t", key: { ctrl: true } })).toBe(true);
    expect(isThreadPanelToggle({ keyValue: "t", key: { ctrl: false } })).toBe(false);
  });
});
