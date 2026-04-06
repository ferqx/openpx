import { describe, expect, test } from "bun:test";
import { getSlashCommandSuggestions, parseCommand } from "../../src/interface/tui/commands";

describe("TUI commands", () => {
  test("parses the v1 slash command surface", () => {
    expect(parseCommand("/new")).toEqual({
      kind: "command",
      name: "new",
    });

    expect(parseCommand("/history")).toEqual({
      kind: "command",
      name: "history",
    });

    expect(parseCommand("/sessions")).toEqual({
      kind: "command",
      name: "sessions",
    });

    expect(parseCommand("/clear")).toEqual({
      kind: "command",
      name: "clear",
    });

    expect(parseCommand("/settings")).toEqual({
      kind: "command",
      name: "settings",
    });

    expect(parseCommand("/help")).toEqual({
      kind: "command",
      name: "help",
    });
  });

  test("parses planning input separately from ordinary submit input", () => {
    expect(parseCommand("/plan improve the shell")).toEqual({
      kind: "plan",
      text: "improve the shell",
    });

    expect(parseCommand("improve the shell")).toEqual({
      kind: "submit",
      text: "improve the shell",
    });
  });

  test("treats legacy slash forms as plain input instead of preferred v1 commands", () => {
    expect(parseCommand("/thread new")).toEqual({
      kind: "submit",
      text: "/thread new",
    });

    expect(parseCommand("/approve approval_123")).toEqual({
      kind: "submit",
      text: "/approve approval_123",
    });

    expect(parseCommand("/reject approval_123")).toEqual({
      kind: "submit",
      text: "/reject approval_123",
    });
  });

  test("filters slash command suggestions for composer autocomplete", () => {
    expect(getSlashCommandSuggestions("")).toEqual([
      "/new",
      "/plan",
      "/history",
      "/sessions",
      "/clear",
      "/settings",
      "/help",
    ]);

    expect(getSlashCommandSuggestions("se")).toEqual([
      "/sessions",
      "/settings",
    ]);
  });
});
