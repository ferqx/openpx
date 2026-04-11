import {
  evalComparableRunSchema,
  evalExpectedControlSemanticsSchema,
  evalExpectedOutcomeSchema,
  type EvalScenario,
} from "../eval/eval-schema";
import { z } from "zod";

export const realEvalSuiteIdSchema = z.literal("real-eval-suite");
export type RealEvalSuiteId = z.infer<typeof realEvalSuiteIdSchema>;

export const realEvalScenarioIdSchema = z.enum([
  "approval-gated-bugfix-loop",
  "reject-and-replan-task-loop",
  "artifact-current-package-loop",
  "interrupt-resume-work-loop",
]);
export type RealEvalScenarioId = z.infer<typeof realEvalScenarioIdSchema>;

export const realEvalScenarioFamilySchema = z.enum([
  "approval-gated-bugfix-loop",
  "reject-and-replan-task-loop",
  "artifact-current-package-loop",
  "interrupt-resume-work-loop",
]);
export type RealEvalScenarioFamily = z.infer<typeof realEvalScenarioFamilySchema>;

export const realEvalCapabilityFamilySchema = z.enum([
  "approval_gated_delete",
  "reject_replan_delete",
  "artifact_current_package",
  "interrupt_resume_recovery",
]);
export type RealEvalCapabilityFamily = z.infer<typeof realEvalCapabilityFamilySchema>;

export const realEvalRecoveryModeSchema = z.enum([
  "none",
  "human_recovery",
  "complete_after_resume",
  "bounded_after_resume",
]);
export type RealEvalRecoveryMode = z.infer<typeof realEvalRecoveryModeSchema>;

export const realEvalCanonicalIntentSchema = z.object({
  capabilityFamily: realEvalCapabilityFamilySchema,
  toolName: z.string().min(1),
  action: z.string().min(1).optional(),
}).strict();
export type RealEvalCanonicalIntent = z.infer<typeof realEvalCanonicalIntentSchema>;

export const realEvalPromptVariantSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
}).strict();
export type RealEvalPromptVariant = z.infer<typeof realEvalPromptVariantSchema>;

export const realEvalControlContractSchema = z.object({
  requiresApproval: z.boolean(),
  requiresReplan: z.boolean(),
  requiresResume: z.boolean(),
}).strict();
export type RealEvalControlContract = z.infer<typeof realEvalControlContractSchema>;

export const realEvalScenarioSchema = z.object({
  id: realEvalScenarioIdSchema,
  version: z.number().int().positive(),
  family: realEvalScenarioFamilySchema,
  capabilityFamily: realEvalCapabilityFamilySchema,
  summary: z.string().min(1),
  userGoal: z.string().min(1),
  taskShell: z.string().min(1),
  promptVariants: z.array(realEvalPromptVariantSchema).min(1),
  canonicalExpectedIntent: realEvalCanonicalIntentSchema,
  controlContract: realEvalControlContractSchema,
  expectedControlSemantics: evalExpectedControlSemanticsSchema,
  expectedOutcome: evalExpectedOutcomeSchema,
  recoveryMode: realEvalRecoveryModeSchema.optional(),
}).strict();
export type RealEvalScenario = z.infer<typeof realEvalScenarioSchema>;

export const realEvalScenarioRunStatusSchema = z.enum(["passed", "failed", "suspicious"]);
export type RealEvalScenarioRunStatus = z.infer<typeof realEvalScenarioRunStatusSchema>;

export const realEvalFailureStageSchema = z.enum([
  "sample_execution",
  "evaluation",
  "review_queue_persist",
  "unknown",
]);
export type RealEvalFailureStage = z.infer<typeof realEvalFailureStageSchema>;

export const realEvalFailureClassSchema = z.enum([
  "planner_normalization_failure",
  "executor_handoff_failure",
  "approval_control_failure",
  "rejection_control_failure",
  "artifact_truth_failure",
  "recovery_consistency_failure",
  "eval_harness_gap",
]);
export type RealEvalFailureClass = z.infer<typeof realEvalFailureClassSchema>;

export const realEvalRootCauseLayerSchema = z.enum([
  "planner",
  "executor",
  "approval_runtime",
  "artifact_runtime",
  "recovery_runtime",
  "eval_harness",
]);
export type RealEvalRootCauseLayer = z.infer<typeof realEvalRootCauseLayerSchema>;

export const realEvalEvolutionTargetSchema = realEvalRootCauseLayerSchema;
export type RealEvalEvolutionTarget = z.infer<typeof realEvalEvolutionTargetSchema>;

export const realEvalRegressionPromotionSchema = z.enum([
  "none",
  "deterministic_eval",
  "runtime_test",
  "scenario_fixture",
]);
export type RealEvalRegressionPromotion = z.infer<typeof realEvalRegressionPromotionSchema>;

export const realEvalBlockingMilestoneSchema = z.enum(["M1"]);
export type RealEvalBlockingMilestone = z.infer<typeof realEvalBlockingMilestoneSchema>;

export const realEvalPromotionStatusSchema = z.enum([
  "not_ready",
  "ready_for_foundation_guard",
]);
export type RealEvalPromotionStatus = z.infer<typeof realEvalPromotionStatusSchema>;

export const realEvalPromotionEvidenceSchema = z.object({
  liveRealEvalPassed: z.boolean(),
  deterministicRegressionPresent: z.boolean(),
  runtimeRegressionPresent: z.boolean(),
}).strict();
export type RealEvalPromotionEvidence = z.infer<typeof realEvalPromotionEvidenceSchema>;

export const realEvalPromotionGuardrailSchema = z.object({
  guardrailId: z.string().min(1),
  capabilityFamily: realEvalCapabilityFamilySchema,
  failureClass: realEvalFailureClassSchema,
  rootCauseLayer: realEvalRootCauseLayerSchema,
  regressionType: realEvalRegressionPromotionSchema,
  description: z.string().min(1),
}).strict();
export type RealEvalPromotionGuardrail = z.infer<typeof realEvalPromotionGuardrailSchema>;

export const realEvalPromotionSummarySchema = z.object({
  capabilityFamily: realEvalCapabilityFamilySchema,
  promotionStatus: realEvalPromotionStatusSchema,
  promotionEvidence: realEvalPromotionEvidenceSchema,
  mappedGuardrails: z.array(realEvalPromotionGuardrailSchema),
}).strict();
export type RealEvalPromotionSummary = z.infer<typeof realEvalPromotionSummarySchema>;

export const realEvalPlannerEvidenceSchema = z.object({
  summary: z.string().min(1).optional(),
  normalizedObjective: z.string().min(1).optional(),
  normalizedCapabilityMarker: z.string().min(1).optional(),
  capabilityFamily: z.string().min(1).optional(),
  requiresApproval: z.boolean().optional(),
  replanHint: z.string().min(1).optional(),
  approvalRequiredActions: z.array(z.string().min(1)),
}).strict();
export type RealEvalPlannerEvidence = z.infer<typeof realEvalPlannerEvidenceSchema>;

export const realEvalApprovalPathEvidenceSchema = z.object({
  approvalRequestObserved: z.boolean(),
  terminalMode: z.string().min(1).optional(),
  blockingReasonKind: z.enum(["waiting_approval", "human_recovery", "environment_block"]).optional(),
  recommendationReason: z.string().min(1).optional(),
}).strict();
export type RealEvalApprovalPathEvidence = z.infer<typeof realEvalApprovalPathEvidenceSchema>;

export const realEvalEvolutionCandidateSchema = z.object({
  scenarioId: realEvalScenarioIdSchema,
  promptVariantId: z.string().min(1).optional(),
  capabilityFamily: realEvalCapabilityFamilySchema,
  failureClass: realEvalFailureClassSchema,
  evolutionTarget: realEvalEvolutionTargetSchema,
  rootCauseHypothesis: z.string().min(1),
  promoteToRegression: realEvalRegressionPromotionSchema,
  blockingMilestone: realEvalBlockingMilestoneSchema,
}).strict();
export type RealEvalEvolutionCandidate = z.infer<typeof realEvalEvolutionCandidateSchema>;

export const realEvalScenarioResultSchema = z.object({
  scenarioId: realEvalScenarioIdSchema,
  scenarioVersion: z.number().int().positive(),
  family: realEvalScenarioFamilySchema,
  capabilityFamily: realEvalCapabilityFamilySchema,
  status: realEvalScenarioRunStatusSchema,
  promptVariantId: z.string().min(1).optional(),
  failureStage: realEvalFailureStageSchema.optional(),
  message: z.string().min(1).optional(),
  failureClass: realEvalFailureClassSchema.optional(),
  evolutionTarget: realEvalEvolutionTargetSchema.optional(),
  artifactsDir: z.string().min(1).optional(),
  tracePath: z.string().min(1).optional(),
}).strict();
export type RealEvalScenarioResult = z.infer<typeof realEvalScenarioResultSchema>;

export const realEvalSuiteExecutionSummarySchema = z.object({
  lane: z.literal("real-eval"),
  suiteId: realEvalSuiteIdSchema,
  suiteRunId: z.string().min(1),
  status: z.enum(["passed", "failed", "suspicious"]),
  exitCode: z.number().int(),
  scenarioSummaries: z.array(realEvalScenarioResultSchema),
  evolutionCandidates: z.array(realEvalEvolutionCandidateSchema),
  promotionSummaries: z.array(realEvalPromotionSummarySchema),
}).strict();
export type RealEvalSuiteExecutionSummary = z.infer<typeof realEvalSuiteExecutionSummarySchema>;

export const realRunTraceMilestoneKindSchema = z.enum([
  "approval_requested",
  "approval_resolved",
  "replan_entry",
  "recovery_boundary",
  "resume_boundary",
  "side_effect",
  "terminal",
]);
export type RealRunTraceMilestoneKind = z.infer<typeof realRunTraceMilestoneKindSchema>;

export const realRunTraceMilestoneSchema = z.object({
  kind: realRunTraceMilestoneKindSchema,
  summary: z.string().min(1).optional(),
  approvalRequestId: z.string().min(1).optional(),
  resolution: z.enum(["approved", "rejected"]).optional(),
  toolName: z.string().min(1).optional(),
}).strict();
export type RealRunTraceMilestone = z.infer<typeof realRunTraceMilestoneSchema>;

export const realRunArtifactContextSchema = z.object({
  currentWorkPackageId: z.string().min(1),
  previousWorkPackageIds: z.array(z.string().min(1)),
  visibleStateWorkPackageId: z.string().min(1).optional(),
  generatedArtifactPath: z.string().min(1).optional(),
  generatedArtifactWorkPackageId: z.string().min(1).optional(),
}).strict().superRefine((value, ctx) => {
  const hasPath = value.generatedArtifactPath !== undefined;
  const hasOwner = value.generatedArtifactWorkPackageId !== undefined;

  if (hasPath !== hasOwner) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "generatedArtifactPath and generatedArtifactWorkPackageId must be provided together.",
      path: hasPath ? ["generatedArtifactWorkPackageId"] : ["generatedArtifactPath"],
    });
  }
});
export type RealRunArtifactContext = z.infer<typeof realRunArtifactContextSchema>;

export const realRunTraceSchema = z.object({
  scenarioId: realEvalScenarioIdSchema,
  promptVariantId: z.string().min(1),
  capabilityFamily: realEvalCapabilityFamilySchema,
  userGoal: z.string().min(1),
  plannerEvidence: realEvalPlannerEvidenceSchema,
  approvalPathEvidence: realEvalApprovalPathEvidenceSchema,
  canonicalExpectedIntent: realEvalCanonicalIntentSchema,
  recoveryMode: realEvalRecoveryModeSchema.optional(),
  threadId: z.string().min(1),
  runId: z.string().min(1),
  taskId: z.string().min(1),
  workerId: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  rejectionReason: z.string().min(1).optional(),
  artifactContext: realRunArtifactContextSchema.optional(),
  pendingApprovalCount: z.number().int().nonnegative(),
  unknownAfterCrashCount: z.number().int().nonnegative(),
  milestones: z.array(realRunTraceMilestoneSchema),
  comparable: evalComparableRunSchema,
}).strict();
export type RealRunTrace = z.infer<typeof realRunTraceSchema>;

export const realSampleSummarySchema = z.object({
  scenarioId: realEvalScenarioIdSchema,
  promptVariantId: z.string().min(1),
  status: z.enum(["completed", "waiting_approval", "blocked", "failed", "suspicious"]),
  threadId: z.string().min(1),
  runId: z.string().min(1),
  taskId: z.string().min(1),
  workspaceRoot: z.string().min(1),
  artifactsDir: z.string().min(1),
  tracePath: z.string().min(1),
  summaryText: z.string().min(1).optional(),
}).strict();
export type RealSampleSummary = z.infer<typeof realSampleSummarySchema>;

export function toOfflineEvalScenario(scenario: Readonly<RealEvalScenario>): EvalScenario {
  return {
    id: scenario.id,
    version: scenario.version,
    family: scenario.family,
    summary: scenario.summary,
    setup: "Stored real-run trace replay",
    steps: ["Load stored trace", "Re-evaluate comparable payload offline"],
    expectedControlSemantics: scenario.expectedControlSemantics,
    expectedOutcome: scenario.expectedOutcome,
    createModelGateway() {
      throw new Error("offline replay must not create a model gateway");
    },
    async run() {
      throw new Error("offline replay must not invoke a live scenario run");
    },
  };
}

export type RealEvalCommandPayload = {
  suiteId?: RealEvalSuiteId;
  scenarioId?: RealEvalScenarioId;
  promptVariantId?: string;
  allVariants: boolean;
  rootDir?: string;
  dataDir?: string;
  json: boolean;
};

export function parseRealEvalCommandArgs(args: string[]): RealEvalCommandPayload {
  let suiteId: RealEvalSuiteId | undefined;
  let scenarioId: RealEvalScenarioId | undefined;
  let promptVariantId: string | undefined;
  let allVariants = false;
  let rootDir: string | undefined;
  let dataDir: string | undefined;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--suite") {
      suiteId = realEvalSuiteIdSchema.parse(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--scenario") {
      scenarioId = realEvalScenarioIdSchema.parse(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--variant") {
      promptVariantId = z.string().min(1).parse(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--all-variants") {
      allVariants = true;
      continue;
    }
    if (arg === "--root-dir") {
      rootDir = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--data-dir") {
      dataDir = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--help") {
      return { suiteId, scenarioId, promptVariantId, allVariants, rootDir, dataDir, json };
    }

    throw new Error(`Unknown real eval command argument: ${arg}`);
  }

  return { suiteId, scenarioId, promptVariantId, allVariants, rootDir, dataDir, json };
}
