import { domainError } from "../../../shared/errors";
import type { ToolExecutor } from "../tool-types";

export const execExecutor: ToolExecutor = async ({ args }) => {
  const command = args.command;
  if (typeof command !== "string" || command.length === 0) {
    throw domainError("exec requires a command");
  }

  return {
    ok: true,
    command,
    args: Array.isArray(args.args) ? args.args : [],
  };
};
