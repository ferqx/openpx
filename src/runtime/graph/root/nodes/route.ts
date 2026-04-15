import type {
  InteractionIntent,
  PendingApprovalState,
  RootMode,
  RootRoute,
  VerificationReport,
} from "../context";
import { createRecommendationEngine } from "../../../../control/policy/recommendation-engine";
import type { WorkPackage } from "../../../planning/work-package";
import type { ArtifactRecord } from "../../../artifacts/artifact-index";
import { routeNext } from "../root-routing-policy";

/** route 节点：把 verifier 反馈、审批推荐和 work package 路由统一折成 mode/route */
export function routeNode(state: { 
  input: string; 
  interactionIntent?: InteractionIntent;
  workPackages?: WorkPackage[];
  currentWorkPackageId?: string;
  pendingApproval?: PendingApprovalState;
  artifacts?: ArtifactRecord[];
  latestArtifacts?: ArtifactRecord[];
  verificationReport?: VerificationReport;
  finalResponse?: string;
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
  if (state.verifierPassed === false) {
    // verifier 失败时，把反馈拼回输入，强制回 executor 修复。
    return {
      mode: "execute",
      route: "executor",
      input: `${state.input}\n\nVerification failed: ${state.verifierFeedback}. Please fix these issues and verify again.`,
      verifierPassed: undefined,
      recommendationReason: undefined,
      currentWorkPackageId: state.currentWorkPackageId,
    };
  }

  if (state.interactionIntent === "verification_request") {
    return {
      mode: "verify",
      route: "verifier",
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

  const recommendationEngine = createRecommendationEngine();
  const recommendation = recommendationEngine.evaluate(state.input);
  if (recommendation.recommendTeam) {
    // recommendation engine 命中高风险团队协作建议时，先走审批确认。
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
    finalResponse: state.finalResponse,
    interactionIntent: state.interactionIntent,
  });

  return {
    mode: decision.mode,
    route: decision.route,
    recommendationReason: undefined,
    currentWorkPackageId: decision.currentWorkPackageId,
  };
}
