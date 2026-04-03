import { join, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

export type AppConfig = {
  workspaceRoot: string;
  projectId: string;
  dataDir: string;
  checkpointConnString: string;
  model: {
    apiKey?: string;
    baseURL?: string;
    name?: string;
  };
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

export function resolveConfig(input: { 
  workspaceRoot: string; 
  dataDir: string;
  projectId?: string;
}): AppConfig {
  const projectId = input.projectId ?? resolveProjectId(input.workspaceRoot);
  return {
    workspaceRoot: input.workspaceRoot,
    projectId,
    dataDir: input.dataDir,
    checkpointConnString: input.dataDir,
    model: {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
      name: process.env.OPENAI_MODEL,
    },
  };
}
