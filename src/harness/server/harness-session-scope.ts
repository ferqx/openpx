import { resolve } from "node:path";

/** harness session 作用域：workspace + project 唯一确定一个 scoped session。 */
export type HarnessSessionScope = {
  workspaceRoot: string;
  projectId: string;
};

/** 创建 harness session registry 时的基础参数。 */
export type HarnessSessionRegistryOptions = {
  dataDir: string;
  workspaceRoot: string;
  projectId?: string;
};

/** 未显式给 projectId 时，默认使用 workspace 目录名。 */
export function resolveDefaultProjectId(workspaceRoot: string): string {
  return resolve(workspaceRoot).split("/").pop() ?? "default-project";
}

/** 归一化 session 作用域：补齐默认 projectId，供 registry 缓存和协议层统一使用。 */
export function normalizeHarnessSessionScope(input: { workspaceRoot: string; projectId?: string }): HarnessSessionScope {
  return {
    workspaceRoot: input.workspaceRoot,
    projectId: input.projectId ?? resolveDefaultProjectId(input.workspaceRoot),
  };
}

/** 作用域键：用于 scoped session 缓存命中。 */
export function harnessSessionScopeKey(scope: HarnessSessionScope): string {
  return `${scope.workspaceRoot}::${scope.projectId}`;
}
