import { resolveConfig } from "../shared/config";

export async function createAppContext(input: { workspaceRoot: string; dataDir: string }) {
  const config = resolveConfig(input);
  const kernel = { handleCommand: async () => undefined };
  return { config, kernel };
}
