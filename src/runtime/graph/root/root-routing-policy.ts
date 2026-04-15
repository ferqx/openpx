import type {
  InteractionIntent,
  PendingApprovalState,
  RootMode,
  VerificationReport,
} from "./context";
import type { ArtifactRecord } from "../../artifacts/artifact-index";
import type { WorkPackage } from "../../planning/work-package";

/** 路由决策：告诉 root graph 下一步走哪条主路径 */
export type RoutingDecision = {
  route: "planner" | "approval" | "executor" | "verifier" | "responder" | "finish";
  mode: RootMode;
  currentWorkPackageId?: string;
};

/** 收集当前 work package 已产出的 artifact */
function collectCurrentWorkPackageArtifacts(state: {
  currentWorkPackageId?: string;
  artifacts?: ArtifactRecord[];
  latestArtifacts?: ArtifactRecord[];
}) {
  const currentWorkPackageId = state.currentWorkPackageId;
  if (!currentWorkPackageId) {
    return [];
  }

  return [...(state.artifacts ?? []), ...(state.latestArtifacts ?? [])].filter(
    (artifact) => artifact.workPackageId === currentWorkPackageId,
  );
}

/** 根据 pending approval / work package / artifact / verification 状态推导下一步路由 */
export function routeNext(state: {
  workPackages?: WorkPackage[];
  currentWorkPackageId?: string;
  pendingApproval?: PendingApprovalState;
  artifacts?: ArtifactRecord[];
  latestArtifacts?: ArtifactRecord[];
  verificationReport?: VerificationReport;
  finalResponse?: string;
  interactionIntent?: InteractionIntent;
}): RoutingDecision {
  if (state.pendingApproval) {
    return {
      route: "approval",
      mode: "waiting_approval",
      currentWorkPackageId: state.currentWorkPackageId,
    };
  }

  const workPackages = state.workPackages ?? [];
  if (workPackages.length === 0) {
    // 没有工作包时必须先去 planner，不能直接执行。
    return {
      route: "planner",
      mode: "plan",
      currentWorkPackageId: undefined,
    };
  }

  const currentWorkPackageId = state.currentWorkPackageId ?? workPackages[0]?.id;
  if (!currentWorkPackageId) {
    return {
      route: "planner",
      mode: "plan",
      currentWorkPackageId: undefined,
    };
  }

  const currentArtifacts = collectCurrentWorkPackageArtifacts({
    currentWorkPackageId,
    artifacts: state.artifacts,
    latestArtifacts: state.latestArtifacts,
  });
  if (currentArtifacts.length === 0) {
    // 当前包还没有任何 artifact，说明 executor 还没真正跑过。
    return {
      route: "executor",
      mode: "execute",
      currentWorkPackageId,
    };
  }

  if (!state.verificationReport) {
    // 已有 artifact 但还没验证，则进入 verifier。
    return {
      route: "verifier",
      mode: "verify",
      currentWorkPackageId,
    };
  }

  if (state.interactionIntent === "verification_request") {
    return {
      route: "verifier",
      mode: "verify",
      currentWorkPackageId,
    };
  }

  if (state.finalResponse) {
    return {
      route: "finish",
      mode: "done",
      currentWorkPackageId,
    };
  }

  return {
    route: "responder",
    mode: "respond",
    currentWorkPackageId,
  };
}
