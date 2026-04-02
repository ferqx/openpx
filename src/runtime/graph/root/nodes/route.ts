import type { WorkerMode } from "../context";

export function routeNode(state: { input: string }): { mode: WorkerMode } {
  const input = state.input.toLowerCase();

  if (/\bverify\b/.test(input)) {
    return { mode: "verify" };
  }
  if (/\bplan\b/.test(input)) {
    return { mode: "plan" };
  }

  return { mode: "execute" };
}
