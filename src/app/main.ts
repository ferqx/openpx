import { createAppContext } from "./bootstrap";

export async function main() {
  return createAppContext({
    workspaceRoot: process.cwd(),
    dataDir: ":memory:",
  });
}
