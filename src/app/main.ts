import { createAppContext } from "./bootstrap";

export async function main(input?: { workspaceRoot?: string; dataDir?: string }) {
  return createAppContext({
    workspaceRoot: input?.workspaceRoot ?? process.cwd(),
    dataDir: input?.dataDir ?? ":memory:",
  });
}
