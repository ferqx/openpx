import type { PendingApprovalState, RootMode, RootRoute, VerificationReport } from "../context";
import { createRecommendationEngine } from "../../../../control/policy/recommendation-engine";
import type { WorkPackage } from "../../../planning/work-package";
import { routeNext } from "../root-routing-policy";

export function routeNode(state: { 
  input: string; 
  workPackages?: WorkPackage[];
  currentWorkPackageId?: string;
  pendingApproval?: PendingApprovalState;
  artifacts?: string[];
  verificationReport?: VerificationReport;
  verifierPassed?: boolean; 
  verifierFeedback?: string; 
  mode?: RootMode;
}): {
  mode: RootMode;
  route: RootRoute;
  input?: string;
  verifierPassed?: boolean;
  recommendationReason?: string;
  currentWorkPackageId?: string;
} {
  const input = state.input.toLowerCase().trim();

  if (state.verifierPassed === false) {
    return {
      mode: "execute",
      route: "executor",
      input: `${state.input}\n\nVerification failed: ${state.verifierFeedback}. Please fix these issues and verify again.`,
      verifierPassed: undefined,
      recommendationReason: undefined,
      currentWorkPackageId: state.currentWorkPackageId,
    };
  }

  if (/\b(completed|done|finished)\b/.test(input)) {
    return { mode: "done", route: "finish", recommendationReason: undefined };
  }

  if (/\bverify\b/.test(input)) {
    return {
      mode: "verify",
      route: "verifier",
      recommendationReason: undefined,
      currentWorkPackageId: state.currentWorkPackageId,
    };
  }

  if (state.mode !== "waiting_approval") {
    const recommendationEngine = createRecommendationEngine();
    const recommendation = recommendationEngine.evaluate(state.input);
    if (recommendation.recommendTeam) {
      return {
        mode: "waiting_approval",
        route: "approval",
        recommendationReason: recommendation.reason,
        currentWorkPackageId: state.currentWorkPackageId,
      };
    }
  }

  const decision = routeNext({
    workPackages: state.workPackages,
    currentWorkPackageId: state.currentWorkPackageId,
    pendingApproval: state.pendingApproval,
    artifacts: state.artifacts,
    verificationReport: state.verificationReport,
  });

  return {
    mode: decision.mode,
    route: decision.route,
    recommendationReason: undefined,
    currentWorkPackageId: decision.currentWorkPackageId,
  };
}
