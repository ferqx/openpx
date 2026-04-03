import { resolve } from "node:path";

export type RuntimeScope = {
  workspaceRoot: string;
  projectId: string;
};

export type RuntimeServiceOptions = {
  dataDir: string;
  workspaceRoot: string;
  projectId?: string;
};

export function resolveDefaultProjectId(workspaceRoot: string): string {
  return resolve(workspaceRoot).split("/").pop() ?? "default-project";
}

export function normalizeScope(input: { workspaceRoot: string; projectId?: string }): RuntimeScope {
  return {
    workspaceRoot: input.workspaceRoot,
    projectId: input.projectId ?? resolveDefaultProjectId(input.workspaceRoot),
  };
}

export function scopeKey(scope: RuntimeScope): string {
  return `${scope.workspaceRoot}::${scope.projectId}`;
}
