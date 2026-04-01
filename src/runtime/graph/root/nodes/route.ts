import type { WorkerMode } from "../context";

export function routeNode(state: { input: string }): { mode: WorkerMode } {
  const input = state.input.toLowerCase();

  if (input.includes("verify")) {
    return { mode: "verify" };
  }
  if (input.includes("plan")) {
    return { mode: "plan" };
  }

  return { mode: "execute" };
}
