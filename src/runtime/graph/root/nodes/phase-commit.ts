import type { RootMode, RootRoute, VerificationReport } from "../context";
import type { ArtifactRecord } from "../../../artifacts/artifact-index";
import type { WorkPackage } from "../../../planning/work-package";

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
