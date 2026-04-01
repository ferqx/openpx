import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { domainError } from "../../../shared/errors";
import type { ToolExecutor } from "../tool-types";

export const applyPatchExecutor: ToolExecutor = async ({ args, path, action }) => {
  if (typeof path !== "string" || path.length === 0) {
    throw domainError("apply_patch requires a path");
  }

  const requestedAction = action ?? "modify_file";
  if (requestedAction === "delete_file") {
    await rm(path, { force: false });
  } else {
    const content = args.content;
    if (typeof content !== "string") {
      throw domainError("apply_patch requires string content for file writes");
    }

    if (requestedAction === "modify_file" && !(await Bun.file(path).exists())) {
      throw domainError("modify_file requires an existing file");
    }

    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, content);
  }

  return {
    ok: true,
    path: path ?? null,
    action: requestedAction,
  };
};
