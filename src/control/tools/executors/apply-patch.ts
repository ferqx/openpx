import { domainError } from "../../../shared/errors";
import type { ToolExecutor } from "../tool-types";

export const applyPatchExecutor: ToolExecutor = async ({ args, path, action }) => {
  const patch = args.patch;
  if (typeof patch !== "string" || patch.length === 0) {
    throw domainError("apply_patch requires a patch");
  }

  return {
    ok: true,
    patch,
    path: path ?? null,
    action: action ?? "modify_file",
  };
};
