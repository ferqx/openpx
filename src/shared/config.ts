export type AppConfig = {
  workspaceRoot: string;
  dataDir: string;
  checkpointConnString: string;
  model: {
    apiKey?: string;
    baseURL?: string;
    name?: string;
  };
};

export function resolveConfig(input: { workspaceRoot: string; dataDir: string }): AppConfig {
  return {
    workspaceRoot: input.workspaceRoot,
    dataDir: input.dataDir,
    checkpointConnString: input.dataDir,
    model: {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
      name: process.env.OPENAI_MODEL,
    },
  };
}
