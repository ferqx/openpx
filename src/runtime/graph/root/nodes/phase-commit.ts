import type { RootMode, RootRoute, VerificationReport } from "../context";
import type { ArtifactRecord } from "../../../artifacts/artifact-index";
import type { WorkPackage } from "../../../planning/work-package";

/** phase-commit：提交当前包的产物，清空瞬时验证状态，并决定是否进入下一包 */
export function phaseCommitNode(state: {
  currentWorkPackageId?: string;
  verificationReport?: VerificationReport;
  artifacts?: ArtifactRecord[];
  latestArtifacts?: ArtifactRecord[];
  workPackages?: WorkPackage[];
  executionDetails?: unknown;
}): {
  artifacts: ArtifactRecord[];
  currentWorkPackageId: string | undefined;
  executionDetails: undefined;
  finalAnswer?: string;
  latestArtifacts: [];
  mode: RootMode;
  route: RootRoute;
  verificationReport: undefined;
  workPackages: WorkPackage[];
} {
  const currentWorkPackageId = state.currentWorkPackageId;
  const nextArtifacts = [...(state.artifacts ?? []), ...(state.latestArtifacts ?? [])];
  const remainingWorkPackages = (state.workPackages ?? []).filter((item) => item.id !== currentWorkPackageId);
  const hasRemainingWork = remainingWorkPackages.length > 0;

  return {
    artifacts: nextArtifacts,
    // 进入下一包前清空 latestArtifacts / verification / executionDetails，
    // 避免上一包的临时状态污染后续执行。
    currentWorkPackageId: hasRemainingWork ? remainingWorkPackages[0]?.id : undefined,
    executionDetails: undefined,
    finalAnswer: hasRemainingWork ? undefined : state.verificationReport?.summary,
    latestArtifacts: [],
    mode: hasRemainingWork ? "execute" : "done",
    route: hasRemainingWork ? "executor" : "finish",
    verificationReport: undefined,
    workPackages: remainingWorkPackages,
  };
}
