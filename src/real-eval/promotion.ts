import type {
  RealEvalCapabilityFamily,
  RealEvalPromotionGuardrail,
  RealEvalPromotionSummary,
  RealEvalRegressionPromotion,
  RealEvalRootCauseLayer,
  RealEvalScenarioResult,
} from "./real-eval-schema";

type PromotionGuardrailInput = {
  guardrailId: string;
  capabilityFamily: RealEvalCapabilityFamily;
  failureClass: RealEvalPromotionGuardrail["failureClass"];
  rootCauseLayer: RealEvalRootCauseLayer;
  regressionType: Extract<RealEvalRegressionPromotion, "deterministic_eval" | "runtime_test">;
  description: string;
};

const PROMOTION_GUARDRAILS: readonly RealEvalPromotionGuardrail[] = [
  {
    guardrailId: "approval.planner.quoted_path_patch_placeholder",
    capabilityFamily: "approval_gated_delete",
    failureClass: "planner_normalization_failure",
    rootCauseLayer: "planner",
    regressionType: "deterministic_eval",
    description: "Quoted delete paths and patch:file placeholders must normalize into apply_patch.delete_file.",
  },
  {
    guardrailId: "approval.planner.deletion_patch_wording",
    capabilityFamily: "approval_gated_delete",
    failureClass: "planner_normalization_failure",
    rootCauseLayer: "planner",
    regressionType: "deterministic_eval",
    description: "Deletion patch, would-be-deleted, and cleanup-preview wording must normalize into apply_patch.delete_file.",
  },
  {
    guardrailId: "approval.runtime.graph_resume_after_approval",
    capabilityFamily: "approval_gated_delete",
    failureClass: "approval_control_failure",
    rootCauseLayer: "approval_runtime",
    regressionType: "runtime_test",
    description: "Approved delete requests must return through the graph and execute the stored apply_patch delete action.",
  },
  {
    guardrailId: "approval.runtime.recommendation_bypass_for_scoped_delete",
    capabilityFamily: "approval_gated_delete",
    failureClass: "approval_control_failure",
    rootCauseLayer: "approval_runtime",
    regressionType: "runtime_test",
    description: "Scoped single-file delete prompts and approval-aware phrasing must not be intercepted by recommendation routing.",
  },
  {
    guardrailId: "reject.comparable.capability_rejection_reroute",
    capabilityFamily: "reject_replan_delete",
    failureClass: "rejection_control_failure",
    rootCauseLayer: "planner",
    regressionType: "deterministic_eval",
    description: "Capability-based rejection reasons must be recognized as reroute-to-planner signals in comparable traces.",
  },
  {
    guardrailId: "reject.runtime.safe_replan_after_rejection",
    capabilityFamily: "reject_replan_delete",
    failureClass: "rejection_control_failure",
    rootCauseLayer: "approval_runtime",
    regressionType: "runtime_test",
    description: "Rejected delete capabilities must re-enter planning and continue on a safer path without reusing the original marker.",
  },
  {
    guardrailId: "reject.runtime.replan_input_not_intercepted",
    capabilityFamily: "reject_replan_delete",
    failureClass: "rejection_control_failure",
    rootCauseLayer: "approval_runtime",
    regressionType: "runtime_test",
    description: "System-generated replan inputs must bypass recommendation routing and re-enter the main runtime path.",
  },
  {
    guardrailId: "artifact.runtime.current_package_ownership",
    capabilityFamily: "artifact_current_package",
    failureClass: "artifact_truth_failure",
    rootCauseLayer: "artifact_runtime",
    regressionType: "runtime_test",
    description: "Generated artifacts must remain owned by the active work package.",
  },
  {
    guardrailId: "artifact.runtime.no_previous_package_leakage",
    capabilityFamily: "artifact_current_package",
    failureClass: "artifact_truth_failure",
    rootCauseLayer: "artifact_runtime",
    regressionType: "runtime_test",
    description: "Artifact truth must not leak from previous work packages into the active package view.",
  },
  {
    guardrailId: "interrupt.runtime.resume_consistency",
    capabilityFamily: "interrupt_resume_recovery",
    failureClass: "recovery_consistency_failure",
    rootCauseLayer: "recovery_runtime",
    regressionType: "runtime_test",
    description: "Interrupted runs must resume without duplicate side effects or visible-state drift.",
  },
] as const;

export function listPromotionGuardrails(): readonly RealEvalPromotionGuardrail[] {
  return PROMOTION_GUARDRAILS;
}

export function listPromotionGuardrailsForFamily(
  capabilityFamily: RealEvalCapabilityFamily,
  guardrails: readonly RealEvalPromotionGuardrail[] = PROMOTION_GUARDRAILS,
): RealEvalPromotionGuardrail[] {
  return guardrails.filter((guardrail) => guardrail.capabilityFamily === capabilityFamily);
}

export function buildPromotionSummaries(input: {
  scenarioSummaries: readonly RealEvalScenarioResult[];
  guardrails?: readonly RealEvalPromotionGuardrail[];
}): RealEvalPromotionSummary[] {
  const guardrails = input.guardrails ?? PROMOTION_GUARDRAILS;
  const families = Array.from(new Set(input.scenarioSummaries.map((scenario) => scenario.capabilityFamily)));

  return families.map((capabilityFamily) => {
    const familyScenarios = input.scenarioSummaries.filter((scenario) => scenario.capabilityFamily === capabilityFamily);
    const mappedGuardrails = listPromotionGuardrailsForFamily(capabilityFamily, guardrails);
    const deterministicRegressionPresent = mappedGuardrails.some((guardrail) => guardrail.regressionType === "deterministic_eval");
    const runtimeRegressionPresent = mappedGuardrails.some((guardrail) => guardrail.regressionType === "runtime_test");
    const liveRealEvalPassed = familyScenarios.length > 0 && familyScenarios.every((scenario) => scenario.status === "passed");

    return {
      capabilityFamily,
      promotionStatus:
        liveRealEvalPassed && deterministicRegressionPresent && runtimeRegressionPresent
          ? "ready_for_foundation_guard"
          : "not_ready",
      promotionEvidence: {
        liveRealEvalPassed,
        deterministicRegressionPresent,
        runtimeRegressionPresent,
      },
      mappedGuardrails,
    };
  });
}
