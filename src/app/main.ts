import React from "react";
import { render, type Instance } from "ink";
import { createAppContext } from "./bootstrap";
import { App } from "../interface/tui/app";

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
  const context = await createAppContext({
    workspaceRoot: input?.workspaceRoot ?? process.cwd(),
    dataDir: input?.dataDir ?? ":memory:",
  });

  const ui = (input?.mount ?? render)(React.createElement(App, { kernel: context.kernel }));
  return {
    ...context,
    ui,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
  } else {
    await main();
  }
}
