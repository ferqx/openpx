import { describe, expect, mock, test } from "bun:test";
import { main, runCli } from "../../src/app/main";

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

  test("disables Ink's default ctrl+c exit so the app can show its own exit hint", async () => {
    const originalTTY = process.stdin.isTTY;
    const originalEnvPort = process.env.OPENPX_RUNTIME_PORT;
    process.stdin.isTTY = true;
    process.env.OPENPX_RUNTIME_PORT = "4312";

    let mountOptions: { exitOnCtrlC?: boolean } | undefined;

    try {
      await main({
        workspaceRoot: "/tmp/openpx-main-test",
        projectId: "openpx-main-test",
        mount(_tree, options) {
          mountOptions = options;
          return { unmount() {} };
        },
      });
    } finally {
      process.stdin.isTTY = originalTTY;
      if (originalEnvPort === undefined) {
        delete process.env.OPENPX_RUNTIME_PORT;
      } else {
        process.env.OPENPX_RUNTIME_PORT = originalEnvPort;
      }
    }

    expect(mountOptions).toEqual({ exitOnCtrlC: false });
  });
});
