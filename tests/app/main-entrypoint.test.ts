import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main, runCli } from "../../src/app/main";

const tempDirs: string[] = [];

async function createTempDir(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

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
    const homeDir = await createTempDir("openpx-home-");
    process.stdin.isTTY = true;
    process.env.OPENPX_RUNTIME_PORT = "4312";

    let mountOptions: { exitOnCtrlC?: boolean } | undefined;

    try {
      await main({
        workspaceRoot: "/tmp/openpx-main-test",
        projectId: "openpx-main-test",
        homeDir,
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

  test("initializes the user config file on first CLI startup", async () => {
    const homeDir = await createTempDir("openpx-home-");
    const workspaceRoot = await createTempDir("openpx-workspace-");

    await main({
      workspaceRoot,
      projectId: "openpx-main-test",
      dataDir: ":memory:",
      homeDir,
      mount() {
        return { unmount() {} };
      },
    });

    const configPath = join(homeDir, ".openpx", "openpx.jsonc");
    const content = await readFile(configPath, "utf8");

    expect(content).not.toContain("\"$schema\"");
    expect(content).toContain("如需配置 provider 与模型槽位");
  });
});
