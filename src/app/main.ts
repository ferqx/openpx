import React from "react";
import { render, type Instance } from "ink";
import { createAppContext } from "./bootstrap";
import { App } from "../interface/tui/app";

type MainInput = {
  workspaceRoot?: string;
  dataDir?: string;
  mount?: (tree: React.ReactElement) => Instance | { unmount?: () => void };
};

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
  await main();
}
