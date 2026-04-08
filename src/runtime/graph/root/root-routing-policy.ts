import type {
  PendingApprovalState,
  RootMode,
  VerificationReport,
} from "./context";
import type { WorkPackage } from "../../planning/work-package";

export type RoutingDecision = {
  route: "planner" | "approval" | "executor" | "verifier" | "finish";
  mode: RootMode;
  currentWorkPackageId?: string;
};

export function routeNext(state: {
  workPackages?: WorkPackage[];
  currentWorkPackageId?: string;
  pendingApproval?: PendingApprovalState;
  artifacts?: string[];
  verificationReport?: VerificationReport;
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

  const artifacts = state.artifacts ?? [];
  if (artifacts.length === 0) {
    return {
      route: "executor",
      mode: "execute",
      currentWorkPackageId,
    };
  }

  if (!state.verificationReport) {
    return {
      route: "verifier",
      mode: "verify",
      currentWorkPackageId,
    };
  }

  return {
    route: "finish",
    mode: "done",
    currentWorkPackageId,
  };
}
