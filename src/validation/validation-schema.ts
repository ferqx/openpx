import { z } from "zod";

/** validation 权限模式 */
export const validationPermissionModeSchema = z.enum(["guarded", "full_access"]);
export type ValidationPermissionMode = z.infer<typeof validationPermissionModeSchema>;

/** validation 输出视图类型 */
export const validationViewSchema = z.enum(["engineering", "product_gate", "scorecard"]);
export type ValidationView = z.infer<typeof validationViewSchema>;

/** validation suite 标识 */
export const validationScenarioSuiteIdSchema = z.enum(["engineering", "release_gate"]);
export type ValidationScenarioSuiteId = z.infer<typeof validationScenarioSuiteIdSchema>;

/** 网络模式 */
export const validationNetworkModeSchema = z.enum(["off", "restricted", "on"]);
export type ValidationNetworkMode = z.infer<typeof validationNetworkModeSchema>;

export const validationCommandClassSchema = z.enum([
  "read",
  "write",
  "test",
  "build",
  "network",
  "destructive_shell",
  "git",
]);
export type ValidationCommandClass = z.infer<typeof validationCommandClassSchema>;

export const validationTaskFamilySchema = z.enum([
  "conversation",
  "code_change",
  "shell_execution",
  "debugging",
  "approval_control",
  "recovery_consistency",
]);
export type ValidationTaskFamily = z.infer<typeof validationTaskFamilySchema>;

export const validationRunStatusSchema = z.enum(["passed", "failed", "suspicious"]);
export type ValidationRunStatus = z.infer<typeof validationRunStatusSchema>;

export const validationFailureClassSchema = z.enum([
  "planner_normalization_failure",
  "executor_handoff_failure",
  "approval_control_failure",
  "rejection_control_failure",
  "artifact_truth_failure",
  "recovery_consistency_failure",
  "eval_harness_gap",
]);
export type ValidationFailureClass = z.infer<typeof validationFailureClassSchema>;

export const validationRootCauseLayerSchema = z.enum([
  "planner",
  "executor",
  "approval_runtime",
  "artifact_runtime",
  "recovery_runtime",
  "eval_harness",
]);
export type ValidationRootCauseLayer = z.infer<typeof validationRootCauseLayerSchema>;

export const validationReviewSeveritySchema = z.enum(["low", "medium", "high"]);
export type ValidationReviewSeverity = z.infer<typeof validationReviewSeveritySchema>;

export const validationRepoSourceSchema = z.object({
  repoId: z.string().min(1),
  snapshot: z.string().min(1),
  localPath: z.string().min(1),
}).strict();
export type ValidationRepoSource = z.infer<typeof validationRepoSourceSchema>;

export const validationSandboxPolicySchema = z.object({
  permissionMode: validationPermissionModeSchema,
  networkMode: validationNetworkModeSchema,
  writableRoots: z.array(z.string().min(1)),
  allowedCommandClasses: z.array(validationCommandClassSchema),
  escalationCommandClasses: z.array(validationCommandClassSchema),
  destructiveActionPolicy: z.enum(["ask", "allow"]),
}).strict();
export type ValidationSandboxPolicy = z.infer<typeof validationSandboxPolicySchema>;

export const validationScenarioFileSandboxPolicySchema = z.object({
  permissionMode: validationPermissionModeSchema,
  availablePermissionModes: z.array(validationPermissionModeSchema).min(1).optional(),
  networkMode: validationNetworkModeSchema,
  writableRoots: z.array(z.string().min(1)),
  allowedCommandClasses: z.array(validationCommandClassSchema),
  escalationCommandClasses: z.array(validationCommandClassSchema),
  destructiveActionPolicy: z.enum(["ask", "allow"]),
}).strict().superRefine((value, ctx) => {
  const modes = value.availablePermissionModes ?? [value.permissionMode];
  if (!modes.includes(value.permissionMode)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "availablePermissionModes must include the default permission mode.",
      path: ["availablePermissionModes"],
    });
  }
});
export type ValidationScenarioFileSandboxPolicy = z.infer<typeof validationScenarioFileSandboxPolicySchema>;

export const validationTaskFamilyAssignmentSchema = z.object({
  primary: validationTaskFamilySchema,
  secondary: z.array(validationTaskFamilySchema),
}).strict();
export type ValidationTaskFamilyAssignment = z.infer<typeof validationTaskFamilyAssignmentSchema>;

export const validationScoringProfileSchema = z.object({
  outcomeWeight: z.number().min(0).max(1),
  trajectoryWeight: z.number().min(0).max(1),
  controlWeight: z.number().min(0).max(1),
}).strict().superRefine((value, ctx) => {
  const total = value.outcomeWeight + value.trajectoryWeight + value.controlWeight;
  if (Math.abs(total - 1) > 0.00001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Scoring weights must sum to 1.",
      path: ["outcomeWeight"],
    });
  }
});
export type ValidationScoringProfile = z.infer<typeof validationScoringProfileSchema>;

export const validationAcceptanceCheckSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1),
    kind: z.literal("file_exists"),
    path: z.string().min(1),
  }).strict(),
  z.object({
    id: z.string().min(1),
    kind: z.literal("file_missing"),
    path: z.string().min(1),
  }).strict(),
]);
export type ValidationAcceptanceCheck = z.infer<typeof validationAcceptanceCheckSchema>;

export const validationBackendSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("deterministic_eval"),
    suiteId: z.string().min(1),
    scenarioId: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal("real_eval"),
    suiteId: z.string().min(1),
    scenarioId: z.string().min(1),
    promptVariantId: z.string().min(1).optional(),
  }).strict(),
]);
export type ValidationBackend = z.infer<typeof validationBackendSchema>;

export const validationScenarioSpecSchema = z.object({
  id: z.string().min(1),
  summary: z.string().min(1),
  taskPrompt: z.string().min(1),
  repoSource: validationRepoSourceSchema,
  sandboxPolicy: validationSandboxPolicySchema,
  taskFamily: validationTaskFamilyAssignmentSchema,
  scoringProfile: validationScoringProfileSchema,
  backend: validationBackendSchema,
  acceptanceChecks: z.array(validationAcceptanceCheckSchema),
}).strict();
export type ValidationScenarioSpec = z.infer<typeof validationScenarioSpecSchema>;

export const validationScenarioFileSpecSchema = z.object({
  id: z.string().min(1),
  summary: z.string().min(1),
  taskPrompt: z.string().min(1),
  repoSource: validationRepoSourceSchema,
  sandboxPolicy: validationScenarioFileSandboxPolicySchema,
  taskFamily: validationTaskFamilyAssignmentSchema,
  scoringProfile: validationScoringProfileSchema,
  backend: validationBackendSchema,
  acceptanceChecks: z.array(validationAcceptanceCheckSchema),
  suites: z.array(validationScenarioSuiteIdSchema).min(1),
  enabled: z.boolean().optional(),
}).strict();
export type ValidationScenarioFileSpec = z.infer<typeof validationScenarioFileSpecSchema>;

export const validationApprovalEventSchema = z.object({
  approvalRequestId: z.string().min(1),
  status: z.enum(["requested", "approved", "rejected"]),
  summary: z.string().min(1),
  source: z.enum(["backend_trace", "backend_comparable"]),
}).strict();
export type ValidationApprovalEvent = z.infer<typeof validationApprovalEventSchema>;

export const validationBackendRefsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("deterministic_eval"),
    suiteId: z.string().min(1),
    scenarioRunId: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal("real_eval"),
    suiteId: z.string().min(1),
    scenarioId: z.string().min(1),
    tracePath: z.string().min(1),
  }).strict(),
]);
export type ValidationBackendRefs = z.infer<typeof validationBackendRefsSchema>;

export const validationVerificationArtifactsSchema = z.object({
  testOutput: z.string().min(1).optional(),
  typecheckOutput: z.string().min(1).optional(),
  buildOutput: z.string().min(1).optional(),
  codeDiff: z.string().min(1).optional(),
}).strict();
export type ValidationVerificationArtifacts = z.infer<typeof validationVerificationArtifactsSchema>;

export const validationArtifactPathsSchema = z.object({
  artifactDir: z.string().min(1),
  evidenceJsonPath: z.string().min(1).optional(),
  verdictJsonPath: z.string().min(1).optional(),
  summaryJsonPath: z.string().min(1).optional(),
  engineeringReportPath: z.string().min(1).optional(),
  productGateReportPath: z.string().min(1).optional(),
  replayJsonPath: z.string().min(1).optional(),
  replayMarkdownPath: z.string().min(1).optional(),
  failureJsonPath: z.string().min(1).optional(),
  failureMarkdownPath: z.string().min(1).optional(),
  truthDiffJsonPath: z.string().min(1).optional(),
  diagnosticsJsonPath: z.string().min(1).optional(),
  scorecardJsonPath: z.string().min(1).optional(),
  scorecardMarkdownPath: z.string().min(1).optional(),
}).strict();
export type ValidationArtifactPaths = z.infer<typeof validationArtifactPathsSchema>;

export const validationAnalyzerVerdictSchema = z.object({
  analyzerId: z.enum(["replay", "failure_report", "truth_diff", "retention_gc", "event_consistency"]),
  status: validationRunStatusSchema,
  reason: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();
export type ValidationAnalyzerVerdict = z.infer<typeof validationAnalyzerVerdictSchema>;

export const validationEvidenceBundleSchema = z.object({
  validationSuiteRunId: z.string().min(1).optional(),
  validationRunId: z.string().min(1),
  scenarioId: z.string().min(1),
  repoSource: validationRepoSourceSchema,
  sandboxPolicy: validationSandboxPolicySchema,
  taskPrompt: z.string().min(1),
  sandboxRoot: z.string().min(1),
  commandLog: z.array(z.string()),
  approvalEvents: z.array(validationApprovalEventSchema),
  backendRefs: validationBackendRefsSchema,
  verificationArtifacts: validationVerificationArtifactsSchema,
  verdictExplanation: z.string().min(1),
  postRunAnalyzers: z.array(validationAnalyzerVerdictSchema).default([]),
  artifactPaths: validationArtifactPathsSchema.optional(),
}).strict();
export type ValidationEvidenceBundle = z.infer<typeof validationEvidenceBundleSchema>;

export const validationRepairRecommendationSchema = z.object({
  recommendationId: z.string().min(1),
  validationRunId: z.string().min(1),
  scenarioId: z.string().min(1),
  failureClass: validationFailureClassSchema,
  rootCauseLayer: validationRootCauseLayerSchema,
  impactedObject: z.string().min(1),
  severity: validationReviewSeveritySchema,
  confidence: z.number().min(0).max(1),
  repairPath: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();
export type ValidationRepairRecommendation = z.infer<typeof validationRepairRecommendationSchema>;

export const validationDimensionResultSchema = z.object({
  status: validationRunStatusSchema,
  score: z.number().min(0).max(1),
  reason: z.string().min(1),
}).strict();
export type ValidationDimensionResult = z.infer<typeof validationDimensionResultSchema>;

export const validationCapabilityScoreSchema = z.object({
  family: validationTaskFamilySchema,
  score: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  blocking: z.boolean(),
}).strict();
export type ValidationCapabilityScore = z.infer<typeof validationCapabilityScoreSchema>;

export const validationReleaseGateSchema = z.object({
  blocked: z.boolean(),
  blockingFamilies: z.array(validationTaskFamilySchema),
}).strict();
export type ValidationReleaseGate = z.infer<typeof validationReleaseGateSchema>;

export const validationVerdictSchema = z.object({
  validationRunId: z.string().min(1),
  scenarioId: z.string().min(1),
  status: validationRunStatusSchema,
  dimensions: z.object({
    outcome: validationDimensionResultSchema,
    trajectory: validationDimensionResultSchema,
    control: validationDimensionResultSchema,
  }).strict(),
  capabilityScores: z.array(validationCapabilityScoreSchema),
  aggregateScore: z.number().min(0).max(1),
  releaseGate: validationReleaseGateSchema,
  repairRecommendations: z.array(validationRepairRecommendationSchema),
}).strict();
export type ValidationVerdict = z.infer<typeof validationVerdictSchema>;

export const validationScenarioVerdictRecordSchema = z.object({
  scenario: validationScenarioSpecSchema,
  evidence: validationEvidenceBundleSchema,
  verdict: validationVerdictSchema,
}).strict();
export type ValidationScenarioVerdictRecord = z.infer<typeof validationScenarioVerdictRecordSchema>;

export const validationAnalyzerCoverageSchema = z.object({
  replayCoverage: z.number().min(0).max(1),
  failureReportCoverage: z.number().min(0).max(1),
  truthDiffCoverage: z.number().min(0).max(1),
  loopEventCoverage: z.number().min(0).max(1),
}).strict();
export type ValidationAnalyzerCoverage = z.infer<typeof validationAnalyzerCoverageSchema>;

export const validationScorecardSchema = z.object({
  generatedAt: z.string().min(1),
  overallStatus: validationRunStatusSchema,
  runtimeCorrectness: z.object({
    coreScenarioSuccessRate: z.number().min(0).max(1),
    approvalResumeSuccessRate: z.number().min(0).max(1),
    cancelCorrectnessRate: z.number().min(0).max(1),
    humanRecoveryCorrectnessRate: z.number().min(0).max(1),
  }).strict(),
  observabilityCoverage: validationAnalyzerCoverageSchema,
  gate: validationReleaseGateSchema,
}).strict();
export type ValidationScorecard = z.infer<typeof validationScorecardSchema>;

export const validationSuiteSummarySchema = z.object({
  validationSuiteRunId: z.string().min(1),
  status: validationRunStatusSchema,
  scenarioVerdicts: z.array(validationScenarioVerdictRecordSchema),
  familyScores: z.array(validationCapabilityScoreSchema),
  aggregateScore: z.number().min(0).max(1),
  releaseGate: validationReleaseGateSchema,
  reviewQueueCount: z.number().int().nonnegative(),
  repairRecommendations: z.array(validationRepairRecommendationSchema),
  analyzerCoverage: validationAnalyzerCoverageSchema.optional(),
  scorecard: validationScorecardSchema.optional(),
  artifactPaths: validationArtifactPathsSchema.optional(),
}).strict();
export type ValidationSuiteSummary = z.infer<typeof validationSuiteSummarySchema>;

export const persistedValidationReviewRecordSchema = z.object({
  reviewItemId: z.string().min(1),
  scenarioId: z.string().min(1),
  validationSuiteRunId: z.string().min(1).optional(),
  validationRunId: z.string().min(1),
  permissionMode: validationPermissionModeSchema,
  repairRecommendationId: z.string().min(1),
  evidenceBundlePath: z.string().min(1),
  scenarioArtifactDir: z.string().min(1).optional(),
  engineeringReportPath: z.string().min(1).optional(),
  productGateReportPath: z.string().min(1).optional(),
  contributedToBlockingFamily: z.boolean().optional(),
}).strict();
export type PersistedValidationReviewRecord = z.infer<typeof persistedValidationReviewRecordSchema>;
