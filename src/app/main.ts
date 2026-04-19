import React from "react";
import { render, type Instance } from "ink";
import { App } from "../surfaces/tui";
import { ensureRuntime } from "../runtime/service/runtime-daemon";
import { RuntimeClient, createRemoteKernel } from "../surfaces/tui/runtime";
import { resolve, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { ensureUserOpenPXConfigFile } from "../config/initializer";

// 产品主入口：启动或复用共享 runtime daemon，然后挂载默认 TUI surface。
// surface 通过 remote-kernel adapter 消费 harness protocol，而不是成为系统本体。
type MainInput = {
  workspaceRoot?: string;
  projectId?: string;
  dataDir?: string;
  homeDir?: string;
  mount?: (
    tree: React.ReactElement,
    options?: { exitOnCtrlC?: boolean },
  ) => Instance | { unmount?: () => void };
};

function resolveProjectId(workspaceRoot: string): string {
  const pkgPath = join(workspaceRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name;
    } catch {
      // ignore
    }
  }
  return resolve(workspaceRoot).split("/").pop() ?? "default-project";
}

function printUsage() {
  console.log(`Usage: bun run src/app/main.ts [--help]

Starts the openpx TUI shell.

Options:
  --help, -h   Show this help text and exit
`);
}

function createTtyError(): Error {
  return new Error("TUI requires an interactive terminal (tty).");
}

export async function main(input?: MainInput) {
  const requiresInteractiveTty = input?.mount === undefined;
  if (requiresInteractiveTty && !process.stdin.isTTY) {
    throw createTtyError();
  }

  const workspaceRoot = input?.workspaceRoot ?? process.cwd();
  const projectId = input?.projectId ?? resolveProjectId(workspaceRoot);
  const dataDir = input?.dataDir ?? process.env.OPENPX_DATA_DIR ?? process.env.OPENWENPX_DATA_DIR ?? ".openpx";

  // CLI 首次启动时，先确保用户级配置文件骨架存在，便于后续统一走文件配置。
  await ensureUserOpenPXConfigFile({
    workspaceRoot,
    homeDir: input?.homeDir,
  });

  // 第一步：确保当前 workspace/project 只有一个 runtime 进程在提供服务。
  const runtimeInfo = await ensureRuntime({
    workspaceRoot,
    projectId,
    dataDir,
  });

  // 第二步：通过协议层把 TUI 连接到 runtime 状态，而不是在 UI 进程里再造一套状态。
  const scopedClient = new RuntimeClient(`http://localhost:${runtimeInfo.port}`, {
    workspaceRoot,
    projectId,
  });
  const remoteKernel = createRemoteKernel(scopedClient);

  const ui = (input?.mount ?? render)(React.createElement(App, { kernel: remoteKernel }), {
    exitOnCtrlC: false,
  });

  return {
    ui,
    client: scopedClient,
    remoteKernel,
  };
}

export async function runCli(args: string[] = process.argv.slice(2), input?: MainInput) {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  await main(input);
}

if (import.meta.main) {
  try {
    await runCli();
  } catch (error) {
    if (error instanceof Error && error.message === "TUI requires an interactive terminal (tty).") {
      console.error(`Error: ${error.message}`);
      console.error("Please run this command in a proper terminal application.");
      console.error("If using an IDE, try running from an external terminal.");
      process.exit(1);
    }
    throw error;
  }
}
