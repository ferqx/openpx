export type AppConfig = {
  workspaceRoot: string;
  dataDir: string;
  checkpointConnString: string;
};

export function resolveConfig(input: { workspaceRoot: string; dataDir: string }): AppConfig {
  return {
    workspaceRoot: input.workspaceRoot,
    dataDir: input.dataDir,
    checkpointConnString: input.dataDir,
  };
}
