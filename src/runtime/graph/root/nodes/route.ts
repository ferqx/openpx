import type { RootMode, WorkerMode } from "../context";

 export function routeNode(state: { 
  input: string; 
  verifierPassed?: boolean; 
  verifierFeedback?: string; 
}): { mode: RootMode; input?: string; verifierPassed?: boolean } {
  const input = state.input.toLowerCase();

  if (state.verifierPassed === false) {
    // If verifier failed, route back to executor with feedback
    return {
      mode: "execute",
      input: `${state.input}\n\nVerification failed: ${state.verifierFeedback}. Please fix these issues and verify again.`,
      verifierPassed: undefined, // Reset so we don't loop forever
    };
  }

  if (/\b(completed|done|finished)\b/.test(input)) {
    return { mode: "done" };
  }
  if (/\bverify\b/.test(input)) {
    return { mode: "verify" };
  }
  if (/\bplan\b/.test(input)) {
    return { mode: "plan" };
  }

  return { mode: "execute" };
}
