import React from "react";
import { render, type Instance } from "ink";
import { App } from "../interface/tui/app";
import { ensureRuntime } from "../runtime/service/runtime-daemon";
import { RuntimeClient } from "../interface/runtime/runtime-client";
import { createRemoteKernel } from "../interface/runtime/remote-kernel";

type MainInput = {
  workspaceRoot?: string;
  dataDir?: string;
  mount?: (tree: React.ReactElement) => Instance | { unmount?: () => void };
};

function printUsage() {
  console.log(`Usage: bun run src/app/main.ts [--help]

Starts the OpenWENPX TUI shell.

Options:
  --help, -h   Show this help text and exit
`);
}

export async function main(input?: MainInput) {
  const workspaceRoot = input?.workspaceRoot ?? process.cwd();
  const dataDir = input?.dataDir ?? process.env.OPENWENPX_DATA_DIR ?? ".openwenpx";

  const runtimeInfo = await ensureRuntime({
    workspaceRoot,
    dataDir,
  });

  const client = new RuntimeClient(`http://localhost:${runtimeInfo.port}`);
  const remoteKernel = createRemoteKernel(client);

  const ui = (input?.mount ?? render)(React.createElement(App, { kernel: remoteKernel }));
  
  return {
    ui,
    client,
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
