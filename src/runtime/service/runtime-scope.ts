import { resolve } from "node:path";

/** runtime 作用域：workspace + project 唯一确定一个 scoped runtime */
export type RuntimeScope = {
  workspaceRoot: string;
  projectId: string;
};

/** 创建 runtime service 时的基础参数 */
export type RuntimeServiceOptions = {
  dataDir: string;
  workspaceRoot: string;
  projectId?: string;
};

/** 未显式给 projectId 时，默认使用 workspace 目录名 */
export function resolveDefaultProjectId(workspaceRoot: string): string {
  return resolve(workspaceRoot).split("/").pop() ?? "default-project";
}

/** 归一化 scope：补齐默认 projectId，供 runtime 缓存和协议层统一使用 */
export function normalizeScope(input: { workspaceRoot: string; projectId?: string }): RuntimeScope {
  return {
    workspaceRoot: input.workspaceRoot,
    projectId: input.projectId ?? resolveDefaultProjectId(input.workspaceRoot),
  };
}

/** 作用域键：用于 scoped runtime 缓存命中 */
export function scopeKey(scope: RuntimeScope): string {
  return `${scope.workspaceRoot}::${scope.projectId}`;
}
