import type { RootMode, WorkerMode } from "../context";
import { createRecommendationEngine } from "../../../../control/policy/recommendation-engine";

export function routeNode(state: { 
  input: string; 
  verifierPassed?: boolean; 
  verifierFeedback?: string; 
  mode?: RootMode;
}): { mode: RootMode; input?: string; verifierPassed?: boolean; recommendationReason?: string } {
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

  // Check for team recommendation only if we are starting a new execution/plan
  // and NOT already in waiting_approval mode (to avoid loops)
  if (state.mode !== "waiting_approval") {
    const recommendationEngine = createRecommendationEngine();
    const recommendation = recommendationEngine.evaluate(state.input);
    if (recommendation.recommendTeam) {
      return {
        mode: "waiting_approval",
        recommendationReason: recommendation.reason,
      };
    }
  }

  if (/\bverify\b/.test(input)) {
    return { mode: "verify" };
  }
  if (/\bplan\b/.test(input)) {
    return { mode: "plan" };
  }

  return { mode: "execute" };
}
