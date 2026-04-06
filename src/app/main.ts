import React from "react";
import { render, type Instance } from "ink";
import { App } from "../interface/tui/app";
import { ensureRuntime } from "../runtime/service/runtime-daemon";
import { RuntimeClient } from "../interface/runtime/runtime-client";
import { createRemoteKernel } from "../interface/runtime/remote-kernel";
import { resolve, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

type MainInput = {
  workspaceRoot?: string;
  projectId?: string;
  dataDir?: string;
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

export async function main(input?: MainInput) {
  // 检查是否在交互式终端中运行
  if (!process.stdin.isTTY) {
    console.error("Error: TUI requires an interactive terminal (tty).");
    console.error("Please run this command in a proper terminal application.");
    console.error("If using an IDE, try running from an external terminal.");
    process.exit(1);
  }

  const workspaceRoot = input?.workspaceRoot ?? process.cwd();
  const projectId = input?.projectId ?? resolveProjectId(workspaceRoot);
  const dataDir = input?.dataDir ?? process.env.OPENPX_DATA_DIR ?? process.env.OPENWENPX_DATA_DIR ?? ".openpx";

  const runtimeInfo = await ensureRuntime({
    workspaceRoot,
    projectId,
    dataDir,
  });

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
  await runCli();
}
