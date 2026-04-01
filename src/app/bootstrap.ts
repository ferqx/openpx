import { resolveConfig } from "../shared/config";
import { createEventBus } from "../kernel/event-bus";

export async function createAppContext(input: { workspaceRoot: string; dataDir: string }) {
  const config = resolveConfig(input);
  const kernel = {
    events: createEventBus(),
    handleCommand: async () => undefined,
  };
  return { config, kernel };
}
