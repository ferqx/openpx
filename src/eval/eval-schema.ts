import type { createAppContext } from "../app/bootstrap";
import type { SessionControlPlaneResult } from "../harness/core/session/session-kernel";
import type { ModelGateway } from "../infra/model-gateway";
import { approvalStatusSchema, runStatusSchema, runTriggerSchema, taskStatusSchema, threadStatusSchema } from "../shared/schemas";
import { z } from "zod";

/** eval 结果状态：passed/failed/suspicious */
export const evalResultStatusSchema = z.enum(["passed", "failed", "suspicious"]);
export type EvalResultStatus = z.infer<typeof evalResultStatusSchema>;

/** review 严重级别 */
export const evalReviewSeveritySchema = z.enum(["low", "medium", "high"]);
export type EvalReviewSeverity = z.infer<typeof evalReviewSeveritySchema>;

/** review 分诊状态 */
export const evalReviewTriageStatusSchema = z.enum(["open", "triaged", "closed"]);
export type EvalReviewTriageStatus = z.infer<typeof evalReviewTriageStatusSchema>;

/** review 关闭类型 */
export const evalReviewResolutionTypeSchema = z.enum(["scenario", "rule", "doc", "accepted_noise"]);
export type EvalReviewResolutionType = z.infer<typeof evalReviewResolutionTypeSchema>;

export const evalReviewFollowUpSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("scenario"),
    suiteId: z.string().min(1),
    scenarioId: z.string().min(1),
    scenarioVersion: z.number().int().positive().optional(),
  }).strict(),
  z.object({
    kind: z.literal("rule"),
    ruleId: z.string().min(1),
    ruleKind: z.enum(["outcome_check", "trajectory_rule"]).optional(),
  }).strict(),
  z.object({
    kind: z.literal("doc"),
    docPath: z.string().min(1),
  }).strict(),
]);
export type EvalReviewFollowUp = z.infer<typeof evalReviewFollowUpSchema>;

export const evalSuiteRunStatusSchema = z.enum(["running", "completed", "failed"]);
export type EvalSuiteRunStatus = z.infer<typeof evalSuiteRunStatusSchema>;

export const evalObjectRefsSchema = z.object({
  threadId: z.string().min(1),
  runIds: z.array(z.string().min(1)),
  taskIds: z.array(z.string().min(1)),
  approvalIds: z.array(z.string().min(1)),
}).strict();
export type EvalObjectRefs = z.infer<typeof evalObjectRefsSchema>;

export const evalRuntimeRefsSchema = z.object({
  threadId: z.string().min(1),
  runs: z.record(z.string().min(1), z.string().min(1)),
  tasks: z.record(z.string().min(1), z.string().min(1)),
  approvals: z.record(z.string().min(1), z.string().min(1)),
  toolCalls: z.record(z.string().min(1), z.string().min(1)),
}).strict();

const evalApprovalComparableSchema = z.object({
  alias: z.string().min(1),
  runAlias: z.string().min(1),
  taskAlias: z.string().min(1),
  status: approvalStatusSchema,
  summary: z.string().min(1),
  toolName: z.string().min(1),
  action: z.string().min(1).optional(),
}).strict();

const evalRunComparableSchema = z.object({
  alias: z.string().min(1),
  trigger: runTriggerSchema,
  status: runStatusSchema,
  activeTaskAlias: z.string().min(1).optional(),
  blockingKind: z.enum(["waiting_approval", "human_recovery", "environment_block"]).optional(),
  summary: z.string().min(1).optional(),
  inputText: z.string().min(1).optional(),
}).strict();

const evalTaskComparableSchema = z.object({
  alias: z.string().min(1),
  runAlias: z.string().min(1),
  status: taskStatusSchema,
  summary: z.string().min(1).optional(),
  blockingKind: z.enum(["waiting_approval", "human_recovery"]).optional(),
}).strict();

const evalSideEffectEntrySchema = z.object({
  taskAlias: z.string().min(1),
  runAlias: z.string().min(1).optional(),
  toolCallAlias: z.string().min(1),
  toolName: z.string().min(1),
  status: z.enum(["planned", "started", "completed", "failed", "unknown_after_crash"]),
}).strict();

export const evalComparableRunSchema = z.object({
  runtimeRefs: evalRuntimeRefsSchema,
  terminalOutcome: z.object({
    threadStatus: threadStatusSchema,
    latestRunAlias: z.string().min(1).optional(),
    latestRunStatus: runStatusSchema.optional(),
    latestTaskAlias: z.string().min(1).optional(),
    latestTaskStatus: taskStatusSchema.optional(),
    pendingApprovalCount: z.number().int().nonnegative(),
    summary: z.string().min(1).optional(),
  }).strict(),
  runLineage: z.array(evalRunComparableSchema),
  taskLineage: z.array(evalTaskComparableSchema),
  approvalFlow: z.object({
    requested: z.array(evalApprovalComparableSchema),
    resolution: z.enum(["none", "approved", "rejected"]),
    graphResumeDetected: z.boolean(),
    rejectionReason: z.string().min(1).optional(),
    reroutedToPlanner: z.boolean(),
  }).strict(),
  recoveryFlow: z.object({
    humanRecoveryTriggered: z.boolean(),
    uncertainExecutionCount: z.number().int().nonnegative(),
    blockedTaskAliases: z.array(z.string().min(1)),
    interruptedRunAliases: z.array(z.string().min(1)),
    resumedRunAliases: z.array(z.string().min(1)),
  }).strict(),
  sideEffects: z.object({
    totalEntries: z.number().int().nonnegative(),
    unknownAfterCrashCount: z.number().int().nonnegative(),
    completedEntries: z.array(evalSideEffectEntrySchema),
    duplicateCompletedToolCallAliases: z.array(z.string().min(1)),
  }).strict(),
  eventMilestones: z.object({
    eventTypes: z.array(z.string().min(1)),
    toolExecutedCount: z.number().int().nonnegative(),
    toolFailedCount: z.number().int().nonnegative(),
    threadBlockedCount: z.number().int().nonnegative(),
    taskCompletedCount: z.number().int().nonnegative(),
    taskFailedCount: z.number().int().nonnegative(),
    taskUpdatedBlockedCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type EvalComparableRun = z.infer<typeof evalComparableRunSchema>;

export const evalExpectedControlSemanticsSchema = z.object({
  requiresApproval: z.boolean(),
  expectedDecision: z.enum(["approved", "rejected", "none"]),
  expectedGraphResume: z.boolean(),
  expectedRecoveryMode: z.enum(["none", "human_recovery"]),
}).strict();
export type EvalExpectedControlSemantics = z.infer<typeof evalExpectedControlSemanticsSchema>;

export const evalExpectedOutcomeSchema = z.object({
  terminalRunStatus: runStatusSchema.optional(),
  terminalTaskStatus: taskStatusSchema.optional(),
  expectedSummaryIncludes: z.array(z.string().min(1)),
  expectedApprovalCount: z.number().int().nonnegative(),
  expectedPendingApprovalCount: z.number().int().nonnegative(),
  expectedToolCallCount: z.number().int().nonnegative(),
}).strict();
export type EvalExpectedOutcome = z.infer<typeof evalExpectedOutcomeSchema>;

export const evalResultSchema = z.object({
  id: z.string().min(1),
  status: evalResultStatusSchema,
  message: z.string().min(1),
  objectRefs: evalObjectRefsSchema,
}).strict();
export type EvalResult = z.infer<typeof evalResultSchema>;
export type EvalCheckResult = EvalResult;
export type EvalRuleResult = EvalResult;

export const evalScenarioMetadataSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  family: z.string().min(1),
  summary: z.string().min(1),
  setup: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  expectedControlSemantics: evalExpectedControlSemanticsSchema,
  expectedOutcome: evalExpectedOutcomeSchema,
}).strict();
export type EvalScenarioMetadata = z.infer<typeof evalScenarioMetadataSchema>;

export const evalScenarioResultSchema = z.object({
  scenarioRunId: z.string().min(1),
  suiteRunId: z.string().min(1).optional(),
  scenarioId: z.string().min(1),
  scenarioVersion: z.number().int().positive(),
  family: z.string().min(1),
  status: evalResultStatusSchema,
  threadId: z.string().min(1).optional(),
  primaryRunId: z.string().min(1).optional(),
  primaryTaskId: z.string().min(1).optional(),
  comparable: evalComparableRunSchema,
  outcomeResults: z.array(evalResultSchema),
  trajectoryResults: z.array(evalResultSchema),
  createdAt: z.string().min(1),
  completedAt: z.string().min(1),
}).strict();
export type EvalScenarioResult = z.infer<typeof evalScenarioResultSchema>;

export const evalReviewQueueItemSchema = z.object({
  reviewItemId: z.string().min(1),
  scenarioRunId: z.string().min(1),
  scenarioId: z.string().min(1),
  sourceType: z.enum(["outcome_check", "trajectory_rule"]),
  sourceId: z.string().min(1),
  severity: evalReviewSeveritySchema,
  triageStatus: evalReviewTriageStatusSchema,
  resolutionType: evalReviewResolutionTypeSchema.optional(),
  summary: z.string().min(1),
  objectRefs: evalObjectRefsSchema,
  ownerNote: z.string().min(1).optional(),
  followUp: evalReviewFollowUpSchema.optional(),
  createdAt: z.string().min(1),
  closedAt: z.string().min(1).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.resolutionType || !value.followUp) {
    return;
  }

  if (value.resolutionType === "scenario" && value.followUp.kind !== "scenario") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "followUp.kind must be scenario when resolutionType is scenario.",
      path: ["followUp"],
    });
  }
  if (value.resolutionType === "rule" && value.followUp.kind !== "rule") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "followUp.kind must be rule when resolutionType is rule.",
      path: ["followUp"],
    });
  }
  if (value.resolutionType === "doc" && value.followUp.kind !== "doc") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "followUp.kind must be doc when resolutionType is doc.",
      path: ["followUp"],
    });
  }
});
export type ReviewQueueItem = z.infer<typeof evalReviewQueueItemSchema>;

export const evalReviewQueueFiltersSchema = z.object({
  triageStatus: evalReviewTriageStatusSchema.optional(),
  severity: evalReviewSeveritySchema.optional(),
  scenarioId: z.string().min(1).optional(),
  sourceType: z.enum(["outcome_check", "trajectory_rule"]).optional(),
  resolutionType: evalReviewResolutionTypeSchema.optional(),
}).strict();
export type EvalReviewQueueFilters = z.infer<typeof evalReviewQueueFiltersSchema>;

export const reviewQueueAggregateSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  byTriageStatus: z.object({
    open: z.number().int().nonnegative(),
    triaged: z.number().int().nonnegative(),
    closed: z.number().int().nonnegative(),
  }).strict(),
  byResolutionType: z.object({
    scenario: z.number().int().nonnegative(),
    rule: z.number().int().nonnegative(),
    doc: z.number().int().nonnegative(),
    accepted_noise: z.number().int().nonnegative(),
  }).strict(),
  closedWithFollowUp: z.number().int().nonnegative(),
  closedMissingFollowUp: z.number().int().nonnegative(),
  acceptedNoiseCount: z.number().int().nonnegative(),
  bySeverity: z.object({
    low: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type ReviewQueueAggregateSummary = z.infer<typeof reviewQueueAggregateSummarySchema>;

export const updateReviewQueueItemInputSchema = z.object({
  reviewItemId: z.string().min(1),
  triageStatus: evalReviewTriageStatusSchema.optional(),
  resolutionType: evalReviewResolutionTypeSchema.optional(),
  ownerNote: z.string().min(1).optional(),
  followUp: evalReviewFollowUpSchema.optional(),
  closedAt: z.string().min(1).optional(),
}).strict().superRefine((value, ctx) => {
  const nextStatus = value.triageStatus;
  if (nextStatus === "closed") {
    if (!value.resolutionType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "resolutionType is required when closing a review item.",
        path: ["resolutionType"],
      });
    }
    if (!value.ownerNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ownerNote is required when closing a review item.",
        path: ["ownerNote"],
      });
    }
    if (!value.closedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "closedAt is required when closing a review item.",
        path: ["closedAt"],
      });
    }
    if (value.resolutionType === "scenario" && value.followUp?.kind !== "scenario") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scenario resolution requires a scenario followUp.",
        path: ["followUp"],
      });
    }
    if (value.resolutionType === "rule" && value.followUp?.kind !== "rule") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rule resolution requires a rule followUp.",
        path: ["followUp"],
      });
    }
    if (value.resolutionType === "doc" && value.followUp?.kind !== "doc") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "doc resolution requires a doc followUp.",
        path: ["followUp"],
      });
    }
  }
});
export type UpdateReviewQueueItemInput = z.infer<typeof updateReviewQueueItemInputSchema>;

export const evalSuiteRunRecordSchema = z.object({
  suiteRunId: z.string().min(1),
  suiteId: z.string().min(1),
  status: evalSuiteRunStatusSchema,
  startedAt: z.string().min(1),
  completedAt: z.string().min(1).optional(),
}).strict();
export type EvalSuiteRunRecord = z.infer<typeof evalSuiteRunRecordSchema>;

export const evalScenarioBaselineSchema = z.object({
  suiteId: z.string().min(1),
  scenarioId: z.string().min(1),
  scenarioVersion: z.number().int().positive(),
  comparable: evalComparableRunSchema,
  outcomeResults: z.array(evalResultSchema),
  trajectoryResults: z.array(evalResultSchema),
  notes: z.string().min(1).optional(),
}).strict();
export type EvalScenarioBaseline = z.infer<typeof evalScenarioBaselineSchema>;

export const evalBaselineDifferenceSchema = z.object({
  field: z.enum(["missing_baseline", "comparable", "outcomeResults", "trajectoryResults"]),
  message: z.string().min(1),
}).strict();
export type EvalBaselineDifference = z.infer<typeof evalBaselineDifferenceSchema>;

export const evalBaselineCompareStatusSchema = z.enum(["matched", "missing", "regressed", "updated"]);
export type EvalBaselineCompareStatus = z.infer<typeof evalBaselineCompareStatusSchema>;

export const evalScenarioBaselineDiffSchema = z.object({
  scenarioId: z.string().min(1),
  scenarioVersion: z.number().int().positive(),
  status: evalBaselineCompareStatusSchema,
  differences: z.array(evalBaselineDifferenceSchema),
}).strict();
export type EvalScenarioBaselineDiff = z.infer<typeof evalScenarioBaselineDiffSchema>;

export const evalScenarioExecutionSummarySchema = z.object({
  scenarioId: z.string().min(1),
  scenarioVersion: z.number().int().positive(),
  status: z.enum(["passed", "failed", "suspicious"]),
  reviewItemCount: z.number().int().nonnegative(),
  baseline: evalScenarioBaselineDiffSchema,
}).strict();
export type EvalScenarioExecutionSummary = z.infer<typeof evalScenarioExecutionSummarySchema>;

export const evalSuiteExecutionSummarySchema = z.object({
  suiteId: z.string().min(1),
  suiteRunId: z.string().min(1),
  status: z.enum(["passed", "failed", "suspicious"]),
  exitCode: z.number().int().nonnegative(),
  reviewQueueCount: z.number().int().nonnegative(),
  reviewQueueAggregate: reviewQueueAggregateSummarySchema,
  scenarioSummaries: z.array(evalScenarioExecutionSummarySchema),
}).strict();
export type EvalSuiteExecutionSummary = z.infer<typeof evalSuiteExecutionSummarySchema>;

export type EvalAppContext = Awaited<ReturnType<typeof createAppContext>>;
export type EvalScenarioExecution = {
  threadId: string;
  initialResult?: SessionControlPlaneResult;
  finalResult?: SessionControlPlaneResult;
  postRunContext?: EvalAppContext;
};

export type EvalScenario = EvalScenarioMetadata & {
  createModelGateway(workspaceRoot: string): ModelGateway;
  run(input: {
    ctx: EvalAppContext;
    workspaceRoot: string;
    dataDir: string;
  }): Promise<EvalScenarioExecution>;
};
