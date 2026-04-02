import { createAppContext } from "./bootstrap";

export async function smokePlanner(input?: { workspaceRoot?: string; dataDir?: string }) {
  const ctx = await createAppContext({
    workspaceRoot: input?.workspaceRoot ?? process.cwd(),
    dataDir: input?.dataDir ?? process.env.OPENWENPX_DATA_DIR ?? ":memory:",
  });

  const result = await ctx.kernel.handleCommand({
    type: "submit_input",
    payload: {
      text: "plan the next improvements for this agent OS TUI and control plane",
    },
  });

  console.log(result.summary);
}

if (import.meta.main) {
  await smokePlanner();
}
