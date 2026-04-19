import { createRecommendationEngine } from "../../../control/policy/recommendation-engine";
import type { ArtifactRecord } from "../../../runtime/artifacts/artifact-index";
import type { WorkPackage } from "../../../runtime/planning/work-package";
import type { RunLoopState } from "./step-types";

function collectCurrentWorkPackageArtifacts(input: {
  currentWorkPackageId?: string;
  artifacts?: ArtifactRecord[];
  latestArtifacts?: ArtifactRecord[];
}) {
  if (!input.currentWorkPackageId) {
    return [];
  }

  return [...(input.artifacts ?? []), ...(input.latestArtifacts ?? [])].filter(
    (artifact) => artifact.workPackageId === input.currentWorkPackageId,
  );
}

/** dispatcher：显式决定 run-loop 下一步。 */
export function dispatchNextStep(
  state: Pick<
    RunLoopState,
    | "input"
    | "currentWorkPackageId"
    | "workPackages"
    | "artifacts"
    | "latestArtifacts"
    | "verificationReport"
    | "finalResponse"
    | "verifierPassed"
    | "verifierFeedback"
    | "recommendationReason"
  >,
) {
  if (state.verifierPassed === false) {
    return {
      input: `${state.input}\n\nVerification failed: ${state.verifierFeedback}. Please fix these issues and verify again.`,
      nextStep: "execute" as const,
      currentWorkPackageId: state.currentWorkPackageId,
      recommendationReason: undefined,
    };
  }

  const recommendation = createRecommendationEngine().evaluate(state.input);
  if (recommendation.recommendTeam) {
    return {
      input: state.input,
      nextStep: "waiting_approval" as const,
      currentWorkPackageId: state.currentWorkPackageId,
      recommendationReason: recommendation.reason,
    };
  }

  const workPackages = state.workPackages ?? [];
  if (workPackages.length === 0) {
    return {
      input: state.input,
      nextStep: "plan" as const,
      currentWorkPackageId: undefined,
      recommendationReason: undefined,
    };
  }

  const currentWorkPackageId = state.currentWorkPackageId ?? workPackages[0]?.id;
  const currentArtifacts = collectCurrentWorkPackageArtifacts({
    currentWorkPackageId,
    artifacts: state.artifacts,
    latestArtifacts: state.latestArtifacts,
  });

  if (currentArtifacts.length === 0) {
    return {
      input: state.input,
      nextStep: "execute" as const,
      currentWorkPackageId,
      recommendationReason: undefined,
    };
  }

  if (!state.verificationReport) {
    return {
      input: state.input,
      nextStep: "verify" as const,
      currentWorkPackageId,
      recommendationReason: undefined,
    };
  }

  if (state.finalResponse) {
    return {
      input: state.input,
      nextStep: "done" as const,
      currentWorkPackageId,
      recommendationReason: undefined,
    };
  }

  return {
    input: state.input,
    nextStep: "respond" as const,
    currentWorkPackageId,
    recommendationReason: undefined,
  };
}
