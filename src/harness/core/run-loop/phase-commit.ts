import type { RunLoopState } from "./step-types";

/** phase commit：提交当前工作包产物，并决定下一步走 execute 还是 respond。 */
export function commitCompletedWorkPackage(
  state: Pick<
    RunLoopState,
    | "currentWorkPackageId"
    | "verificationReport"
    | "artifacts"
    | "latestArtifacts"
    | "workPackages"
    | "executionDetails"
  >,
) {
  const currentWorkPackageId = state.currentWorkPackageId;
  const artifacts = [...(state.artifacts ?? []), ...(state.latestArtifacts ?? [])];
  const remainingWorkPackages = (state.workPackages ?? []).filter((item) => item.id !== currentWorkPackageId);
  const hasRemainingWork = remainingWorkPackages.length > 0;

  return {
    artifacts,
    currentWorkPackageId: hasRemainingWork ? remainingWorkPackages[0]?.id : undefined,
    executionDetails: undefined,
    latestArtifacts: [] as [],
    nextStep: hasRemainingWork ? ("execute" as const) : ("respond" as const),
    verificationReport: undefined,
    verificationSummary: state.verificationReport?.summary,
    workPackages: remainingWorkPackages,
  };
}
