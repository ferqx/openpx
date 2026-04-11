import type { RealTraceEvaluation } from "./evaluation";
import type {
  RealEvalCapabilityFamily,
  RealEvalEvolutionCandidate,
  RealEvalFailureClass,
  RealEvalPlannerEvidence,
  RealEvalApprovalPathEvidence,
  RealEvalRegressionPromotion,
  RealEvalRootCauseLayer,
  RealEvalScenario,
  RealEvalScenarioResult,
  RealRunTrace,
} from "./real-eval-schema";

type ClassificationInput = {
  scenario: Readonly<RealEvalScenario>;
  scenarioResult: RealEvalScenarioResult;
  trace?: RealRunTrace;
  evaluation?: RealTraceEvaluation;
  plannerEvidence?: RealEvalPlannerEvidence;
  approvalPathEvidence?: RealEvalApprovalPathEvidence;
};

function createCandidate(input: {
  scenarioId: RealEvalScenario["id"];
  promptVariantId?: string;
  capabilityFamily: RealEvalCapabilityFamily;
  failureClass: RealEvalFailureClass;
  evolutionTarget: RealEvalRootCauseLayer;
  rootCauseHypothesis: string;
  promoteToRegression: RealEvalRegressionPromotion;
}): RealEvalEvolutionCandidate {
  return {
    scenarioId: input.scenarioId,
    promptVariantId: input.promptVariantId,
    capabilityFamily: input.capabilityFamily,
    failureClass: input.failureClass,
    evolutionTarget: input.evolutionTarget,
    rootCauseHypothesis: input.rootCauseHypothesis,
    promoteToRegression: input.promoteToRegression,
    blockingMilestone: "M1",
  };
}

function mapRootCauseLayerToRegression(layer: RealEvalRootCauseLayer): RealEvalRegressionPromotion {
  switch (layer) {
    case "planner":
      return "deterministic_eval";
    case "executor":
    case "approval_runtime":
    case "artifact_runtime":
    case "recovery_runtime":
      return "runtime_test";
    case "eval_harness":
      return "scenario_fixture";
  }
}

function inferSampleFailureCandidate(input: {
  scenario: Readonly<RealEvalScenario>;
  scenarioResult: RealEvalScenarioResult;
  plannerEvidence?: RealEvalPlannerEvidence;
  approvalPathEvidence?: RealEvalApprovalPathEvidence;
}): RealEvalEvolutionCandidate {
  const plannerEvidence = input.plannerEvidence;
  const approvalEvidence = input.approvalPathEvidence;
  const expectedMarker = `${input.scenario.canonicalExpectedIntent.toolName}.${input.scenario.canonicalExpectedIntent.action ?? "execute"}`;
  const normalizedMarker = plannerEvidence?.normalizedCapabilityMarker;

  if (input.scenarioResult.failureStage === "sample_execution" && input.scenarioResult.message?.includes("never reached approval")) {
    if (!approvalEvidence?.approvalRequestObserved && normalizedMarker === expectedMarker) {
      return createCandidate({
        scenarioId: input.scenario.id,
        promptVariantId: input.scenarioResult.promptVariantId,
        capabilityFamily: input.scenario.capabilityFamily,
        failureClass: "approval_control_failure",
        evolutionTarget: "approval_runtime",
        rootCauseHypothesis: "Planner normalized the prompt into the expected delete capability, but runtime never materialized a real approval object.",
        promoteToRegression: "runtime_test",
      });
    }

    return createCandidate({
      scenarioId: input.scenario.id,
      promptVariantId: input.scenarioResult.promptVariantId,
      capabilityFamily: input.scenario.capabilityFamily,
      failureClass: "planner_normalization_failure",
      evolutionTarget: "planner",
      rootCauseHypothesis: "Planner did not normalize the prompt variant into the expected approval-gated delete capability.",
      promoteToRegression: "deterministic_eval",
    });
  }

  return createCandidate({
    scenarioId: input.scenario.id,
    promptVariantId: input.scenarioResult.promptVariantId,
    capabilityFamily: input.scenario.capabilityFamily,
    failureClass: "eval_harness_gap",
    evolutionTarget: "eval_harness",
    rootCauseHypothesis: "The real-eval lane failed before a stable capability diagnosis could be produced.",
    promoteToRegression: "scenario_fixture",
  });
}

export function classifyRealEvalExecution(input: ClassificationInput): RealEvalEvolutionCandidate[] {
  if (input.scenarioResult.status === "passed") {
    return [];
  }

  if (
    input.scenarioResult.failureStage === "evaluation"
    || input.scenarioResult.failureStage === "review_queue_persist"
  ) {
    return [
      createCandidate({
        scenarioId: input.scenario.id,
        promptVariantId: input.scenarioResult.promptVariantId,
        capabilityFamily: input.scenario.capabilityFamily,
        failureClass: "eval_harness_gap",
        evolutionTarget: "eval_harness",
        rootCauseHypothesis: input.scenarioResult.failureStage === "evaluation"
          ? "Evaluation failed before a stable real-eval diagnosis could be produced."
          : "Review queue persistence failed before the real-eval diagnosis could be durably recorded.",
        promoteToRegression: "scenario_fixture",
      }),
    ];
  }

  if (input.evaluation) {
    return input.evaluation.reviewItems.map((item) =>
      createCandidate({
        scenarioId: item.scenarioId as RealEvalScenario["id"],
        promptVariantId: input.scenarioResult.promptVariantId,
        capabilityFamily: input.scenario.capabilityFamily,
        failureClass: item.failureClass,
        evolutionTarget: item.rootCauseLayer,
        rootCauseHypothesis: item.summary,
        promoteToRegression: mapRootCauseLayerToRegression(item.rootCauseLayer),
      }),
    );
  }

  return [
    inferSampleFailureCandidate({
      scenario: input.scenario,
      scenarioResult: input.scenarioResult,
      plannerEvidence: input.plannerEvidence,
      approvalPathEvidence: input.approvalPathEvidence,
    }),
  ];
}
