import path from "node:path";

/** 解析 eval 数据目录输入 */
type ResolveEvalDataDirInput = {
  workspaceRoot: string;
  explicitDataDir?: string;
};

/** 解析 eval sqlite 路径：优先显式参数，其次环境变量，最后落到 workspace 内默认目录 */
export function resolveEvalDataDir(input: ResolveEvalDataDirInput): string {
  if (input.explicitDataDir) {
    return input.explicitDataDir;
  }

  const envPath = process.env.OPENPX_EVAL_DATA_DIR;
  if (envPath && envPath.length > 0) {
    return envPath;
  }

  return path.join(input.workspaceRoot, ".openpx", "eval", "eval.sqlite");
}
