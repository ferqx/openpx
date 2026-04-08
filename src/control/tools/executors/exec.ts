import { domainError } from "../../../shared/errors";
import type { ToolExecutor } from "../tool-types";

export const execExecutor: ToolExecutor = async ({ args, command, commandArgs, cwd, timeoutMs }) => {
  const resolvedCommand = command ?? (typeof args.command === "string" ? args.command : undefined);
  const resolvedArgs = commandArgs ?? (Array.isArray(args.args) ? args.args.filter((value): value is string => typeof value === "string") : []);
  const resolvedCwd = cwd ?? (typeof args.cwd === "string" ? args.cwd : undefined);
  if (typeof resolvedCommand !== "string" || resolvedCommand.length === 0) {
    throw domainError("exec requires a command");
  }

  const proc = Bun.spawn([resolvedCommand, ...resolvedArgs], {
    cwd: resolvedCwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (typeof timeoutMs === "number" && timeoutMs > 0) {
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      clearTimeout(timer);
      return {
        ok: exitCode === 0,
        command: resolvedCommand,
        args: resolvedArgs,
        cwd: resolvedCwd,
        exitCode,
        stdout,
        stderr,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return {
    ok: exitCode === 0,
    command: resolvedCommand,
    args: resolvedArgs,
    cwd: resolvedCwd,
    exitCode,
    stdout,
    stderr,
  };
};
