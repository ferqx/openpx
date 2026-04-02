import { describe, expect, mock, test } from "bun:test";
import { runCli } from "../../src/app/main";

describe("main entrypoint", () => {
  test("prints usage and exits for --help without mounting the TUI", async () => {
    const logs: string[] = [];
    const logMock = mock((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    const originalLog = console.log;
    console.log = logMock;

    let mounted = false;
    try {
      await runCli(["--help"], {
        mount() {
          mounted = true;
          return { unmount() {} };
        },
      });
    } finally {
      console.log = originalLog;
    }

    expect(mounted).toBe(false);
    expect(logs.join("\n")).toContain("Usage: bun run src/app/main.ts [--help]");
    expect(logs.join("\n")).toContain("--help, -h");
  });
});
