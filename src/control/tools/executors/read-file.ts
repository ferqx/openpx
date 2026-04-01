import { domainError } from "../../../shared/errors";
import type { ToolExecutor } from "../tool-types";

export const readFileExecutor: ToolExecutor = async ({ path: requestPath, args }) => {
  const path = requestPath ?? args.path;
  if (typeof path !== "string" || path.length === 0) {
    throw domainError("read_file requires a path");
  }

  const content = await Bun.file(path).text();
  return { path, content };
};
