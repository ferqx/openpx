import { describe, expect, test } from "bun:test";
import { buildPromotionSummaries, listPromotionGuardrailsForFamily } from "../../src/real-eval/promotion";
import type { RealEvalPromotionGuardrail, RealEvalScenarioResult } from "../../src/real-eval/real-eval-schema";

function createScenarioSummary(
  overrides?: Partial<RealEvalScenarioResult>,
): RealEvalScenarioResult {
  return {
    scenarioId: "approval-gated-bugfix-loop",
    scenarioVersion: 1,
    family: "approval-gated-bugfix-loop",
    capabilityFamily: "approval_gated_delete",
    status: "passed",
    promptVariantId: "canonical",
    ...overrides,
  };
}

describe("real-eval promotion summaries", () => {
  test("marks a live-passing family as ready when deterministic and runtime guardrails exist", () => {
    const summaries = buildPromotionSummaries({
      scenarioSummaries: [
        createScenarioSummary({ promptVariantId: "canonical" }),
        createScenarioSummary({ promptVariantId: "polite" }),
        createScenarioSummary({ promptVariantId: "constraint" }),
      ],
    });

    expect(summaries).toEqual([
      expect.objectContaining({
        capabilityFamily: "approval_gated_delete",
        promotionStatus: "ready_for_foundation_guard",
        promotionEvidence: {
          liveRealEvalPassed: true,
          deterministicRegressionPresent: true,
          runtimeRegressionPresent: true,
        },
      }),
    ]);
  });

  test("keeps promotion not_ready when regression coverage is incomplete", () => {
    const customGuardrails: RealEvalPromotionGuardrail[] = [
      {
        guardrailId: "approval.planner.only",
        capabilityFamily: "approval_gated_delete",
        failureClass: "planner_normalization_failure",
        rootCauseLayer: "planner",
        regressionType: "deterministic_eval",
        description: "Only deterministic coverage exists.",
      },
    ];

    const summaries = buildPromotionSummaries({
      scenarioSummaries: [createScenarioSummary()],
      guardrails: customGuardrails,
    });

    expect(summaries[0]).toEqual(
      expect.objectContaining({
        promotionStatus: "not_ready",
        promotionEvidence: {
          liveRealEvalPassed: true,
          deterministicRegressionPresent: true,
          runtimeRegressionPresent: false,
        },
      }),
    );
  });

  test("keeps promotion not_ready when the live family still has failures", () => {
    const summaries = buildPromotionSummaries({
      scenarioSummaries: [
        createScenarioSummary({ promptVariantId: "canonical", status: "passed" }),
        createScenarioSummary({ promptVariantId: "constraint", status: "failed", failureClass: "planner_normalization_failure" }),
      ],
    });

    expect(summaries[0]).toEqual(
      expect.objectContaining({
        promotionStatus: "not_ready",
        promotionEvidence: {
          liveRealEvalPassed: false,
          deterministicRegressionPresent: true,
          runtimeRegressionPresent: true,
        },
      }),
    );
  });

  test("maps approval and reject families to the expected guardrails", () => {
    const approvalGuardrails = listPromotionGuardrailsForFamily("approval_gated_delete");
    const rejectGuardrails = listPromotionGuardrailsForFamily("reject_replan_delete");
    const artifactGuardrails = listPromotionGuardrailsForFamily("artifact_current_package");

    expect(approvalGuardrails.map((guardrail) => guardrail.guardrailId)).toEqual(
      expect.arrayContaining([
        "approval.planner.quoted_path_patch_placeholder",
        "approval.planner.deletion_patch_wording",
        "approval.runtime.graph_resume_after_approval",
        "approval.runtime.recommendation_bypass_for_scoped_delete",
      ]),
    );
    expect(rejectGuardrails.map((guardrail) => guardrail.guardrailId)).toEqual(
      expect.arrayContaining([
        "reject.comparable.capability_rejection_reroute",
        "reject.runtime.safe_replan_after_rejection",
        "reject.runtime.replan_input_not_intercepted",
      ]),
    );
    expect(artifactGuardrails.map((guardrail) => guardrail.guardrailId)).toEqual(
      expect.arrayContaining([
        "artifact.runtime.current_package_ownership",
        "artifact.runtime.no_previous_package_leakage",
      ]),
    );
  });
});
