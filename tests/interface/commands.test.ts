import { describe, expect, test } from "bun:test";
import { parseCommand } from "../../src/interface/tui/commands";

describe("TUI commands", () => {
  test("parses thread lifecycle commands", () => {
    expect(parseCommand("/thread new")).toEqual({
      type: "thread_new",
    });

    expect(parseCommand("/thread switch thread_123")).toEqual({
      type: "thread_switch",
      payload: {
        threadId: "thread_123",
      },
    });

    expect(parseCommand("/thread continue thread_456")).toEqual({
      type: "thread_continue",
      payload: {
        threadId: "thread_456",
      },
    });

    expect(parseCommand("/thread list")).toEqual({
      type: "thread_list",
    });
  });
});
