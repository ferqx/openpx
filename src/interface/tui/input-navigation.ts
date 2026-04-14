import type { RuntimeSessionState } from "../runtime/runtime-session";

/** 会话列表项类型别名 */
type SessionThreadSummary = RuntimeSessionState["threads"][number];

/** 输入键状态：抽取出导航逻辑真正关心的键 */
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

/** sessions pane 导航结果：选择、切换或空操作 */
export type SessionsPaneAction =
  | { kind: "select"; index: number }
  | { kind: "switch"; threadId: string }
  | { kind: "noop" };

/** 根据键盘输入解析 sessions pane 导航行为 */
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

/** 计算 interaction stream 的翻页滚动增量 */
export function resolveStreamScrollDelta(key: Pick<InputKeyState, "pageUp" | "pageDown">): number {
  if (key.pageUp) {
    return 3;
  }

  if (key.pageDown) {
    return -3;
  }

  return 0;
}

/** Ctrl+T 是否表示切换线程面板 */
export function isThreadPanelToggle(input: { keyValue: string; key: Pick<InputKeyState, "ctrl"> }): boolean {
  return input.key.ctrl && input.keyValue === "t";
}
