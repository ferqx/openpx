import type { PendingApprovalState, RootMode, RootRoute, VerificationReport } from "../context";
import { createRecommendationEngine } from "../../../../control/policy/recommendation-engine";
import type { WorkPackage } from "../../../planning/work-package";
import type { ArtifactRecord } from "../../../artifacts/artifact-index";
import { routeNext } from "../root-routing-policy";

export function routeNode(state: { 
  input: string; 
  workPackages?: WorkPackage[];
  currentWorkPackageId?: string;
  pendingApproval?: PendingApprovalState;
  artifacts?: ArtifactRecord[];
  latestArtifacts?: ArtifactRecord[];
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

  if (state.mode === "waiting_approval") {
    return {
      mode: "waiting_approval",
      route: "approval",
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

  const decision = routeNext({
    workPackages: state.workPackages,
    currentWorkPackageId: state.currentWorkPackageId,
    pendingApproval: state.pendingApproval,
    artifacts: state.artifacts,
    latestArtifacts: state.latestArtifacts,
    verificationReport: state.verificationReport,
  });

  return {
    mode: decision.mode,
    route: decision.route,
    recommendationReason: undefined,
    currentWorkPackageId: decision.currentWorkPackageId,
  };
}
