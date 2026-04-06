import type { RootMode } from "../context";
import { createRecommendationEngine } from "../../../../control/policy/recommendation-engine";

export function routeNode(state: { 
  input: string; 
  verifierPassed?: boolean; 
  verifierFeedback?: string; 
  mode?: RootMode;
}): { mode: RootMode; input?: string; verifierPassed?: boolean; recommendationReason?: string } {
  const input = state.input.toLowerCase().trim();

  // 1. Verifier Feedback Loop
  if (state.verifierPassed === false) {
    return {
      mode: "execute",
      input: `${state.input}\n\nVerification failed: ${state.verifierFeedback}. Please fix these issues and verify again.`,
      verifierPassed: undefined,
      recommendationReason: undefined,
    };
  }

  // 2. Explicit Termination
  if (/\b(completed|done|finished)\b/.test(input)) {
    return { mode: "done", recommendationReason: undefined };
  }

  // 3. Explicit Mode Triggers
  if (/\bverify\b/.test(input)) {
    return { mode: "verify", recommendationReason: undefined };
  }
  if (/\bplan\b/.test(input)) {
    return { mode: "plan", recommendationReason: undefined };
  }

  // 4. CHAT/RESPOND HEURISTICS: Direct Response for simple talk
  const isSimpleChat = /^(hi|hello|hey|hola|你好|您好|谁|who are you|what can you do|你是谁|天气)/i.test(input);
  if (isSimpleChat) {
    return { mode: "respond", recommendationReason: undefined };
  }

  // 5. POLICY CHECK: Check for team recommendation only if we are starting a new work turn
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

  // 6. DEFAULT: All other technical inputs go to planner for goal-setting
  return { mode: "plan", recommendationReason: undefined };
}
