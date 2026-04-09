import path from "node:path";

type ResolveEvalDataDirInput = {
  workspaceRoot: string;
  explicitDataDir?: string;
};

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
