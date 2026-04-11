import { normalizeComparableRun } from "../eval/comparable-run";
import type { EvalAppContext } from "../eval/eval-schema";
import {
  realEvalApprovalPathEvidenceSchema,
  realEvalPlannerEvidenceSchema,
  realRunTraceSchema,
  type RealEvalApprovalPathEvidence,
  type RealEvalCanonicalIntent,
  type RealEvalCapabilityFamily,
  type RealEvalPlannerEvidence,
  type RealEvalScenarioId,
  type RealRunArtifactContext,
  type RealRunTrace,
} from "./real-eval-schema";

type BuildRealRunTraceInput = {
  scenarioId: RealEvalScenarioId;
  promptVariantId: string;
  capabilityFamily: RealEvalCapabilityFamily;
  userGoal: string;
  canonicalExpectedIntent: RealEvalCanonicalIntent;
  plannerEvidence: RealEvalPlannerEvidence;
  approvalPathEvidence: RealEvalApprovalPathEvidence;
  threadId: string;
  runId: string;
  taskId: string;
  comparable: RealRunTrace["comparable"];
  artifactContext?: RealRunArtifactContext;
  workerId?: string;
  recoveryMode?: RealRunTrace["recoveryMode"];
};

type CollectRealRunTraceInput = {
  ctx: EvalAppContext;
  scenarioId: RealEvalScenarioId;
  promptVariantId: string;
  capabilityFamily: RealEvalCapabilityFamily;
  userGoal: string;
  canonicalExpectedIntent: RealEvalCanonicalIntent;
  plannerEvidence: RealEvalPlannerEvidence;
  approvalPathEvidence: RealEvalApprovalPathEvidence;
  threadId: string;
  runId: string;
  taskId: string;
  artifactContext?: RealRunArtifactContext;
  recoveryMode?: RealRunTrace["recoveryMode"];
};

function resolveConsistentTraceIdentity(input: {
  comparable: RealRunTrace["comparable"];
  runId: string;
  taskId: string;
}): { runId: string; taskId: string } {
  const runAlias = Object.entries(input.comparable.runtimeRefs.runs)
    .find(([, actualId]) => actualId === input.runId)?.[0];
  const taskAlias = Object.entries(input.comparable.runtimeRefs.tasks)
    .find(([, actualId]) => actualId === input.taskId)?.[0];

  if (!runAlias || !taskAlias) {
    throw new Error(`Unable to resolve trace identity for run ${input.runId} and task ${input.taskId}.`);
  }

  const task = input.comparable.taskLineage.find((entry) => entry.alias === taskAlias);
  if (!task) {
    throw new Error(`Task lineage entry missing for trace task ${input.taskId}.`);
  }
  if (task.runAlias !== runAlias) {
    throw new Error(`Trace run/task identity mismatch for run ${input.runId} and task ${input.taskId}.`);
  }

  return {
    runId: input.runId,
    taskId: input.taskId,
  };
}

export function buildRealRunTrace(input: BuildRealRunTraceInput): RealRunTrace {
  const milestones: RealRunTrace["milestones"] = [];

  const firstApproval = input.comparable.approvalFlow.requested[0];
  if (firstApproval) {
    milestones.push({
      kind: "approval_requested",
      approvalRequestId: input.comparable.runtimeRefs.approvals[firstApproval.alias],
      summary: firstApproval.summary,
      toolName: firstApproval.toolName,
    });
  }

  if (input.comparable.approvalFlow.resolution === "approved" || input.comparable.approvalFlow.resolution === "rejected") {
    milestones.push({
      kind: "approval_resolved",
      approvalRequestId: firstApproval ? input.comparable.runtimeRefs.approvals[firstApproval.alias] : undefined,
      resolution: input.comparable.approvalFlow.resolution,
      summary: input.comparable.approvalFlow.rejectionReason ?? input.comparable.terminalOutcome.summary,
    });
  }

  if (input.comparable.approvalFlow.reroutedToPlanner) {
    milestones.push({
      kind: "replan_entry",
      summary: input.comparable.approvalFlow.rejectionReason ?? "Approval rejection rerouted the run back into planning.",
    });
  }

  if (input.comparable.recoveryFlow.humanRecoveryTriggered || input.comparable.recoveryFlow.uncertainExecutionCount > 0) {
    milestones.push({
      kind: "recovery_boundary",
      summary: input.comparable.terminalOutcome.summary ?? "Recovery boundary detected.",
    });
  }

  if (input.comparable.approvalFlow.graphResumeDetected || input.comparable.recoveryFlow.resumedRunAliases.length > 0) {
    milestones.push({
      kind: "resume_boundary",
      summary: input.comparable.terminalOutcome.summary ?? "Execution resumed after a control boundary.",
    });
  }

  for (const entry of input.comparable.sideEffects.completedEntries) {
    milestones.push({
      kind: "side_effect",
      summary: `${entry.toolName} completed`,
      toolName: entry.toolName,
    });
  }

  if (
    input.scenarioId === "artifact-current-package-loop"
    && milestones.every((milestone) => milestone.kind !== "side_effect")
    && input.artifactContext?.generatedArtifactPath
  ) {
    milestones.push({
      kind: "side_effect",
      summary: `artifact recorded for ${input.artifactContext.generatedArtifactPath}`,
      toolName: "respond",
    });
  }

  if (
    input.scenarioId === "interrupt-resume-work-loop"
    && input.recoveryMode !== undefined
    && milestones.every((milestone) => milestone.kind !== "recovery_boundary")
  ) {
    milestones.push({
      kind: "recovery_boundary",
      summary: "Execution crossed an interrupt boundary before resuming.",
    });
  }

  if (
    input.scenarioId === "interrupt-resume-work-loop"
    && input.recoveryMode !== undefined
    && milestones.every((milestone) => milestone.kind !== "resume_boundary")
  ) {
    milestones.push({
      kind: "resume_boundary",
      summary: "Execution resumed after interruption.",
    });
  }

  milestones.push({
    kind: "terminal",
    summary: input.comparable.terminalOutcome.summary,
  });

  return realRunTraceSchema.parse({
    scenarioId: input.scenarioId,
    promptVariantId: input.promptVariantId,
    capabilityFamily: input.capabilityFamily,
    userGoal: input.userGoal,
    plannerEvidence: realEvalPlannerEvidenceSchema.parse(input.plannerEvidence),
    approvalPathEvidence: realEvalApprovalPathEvidenceSchema.parse(input.approvalPathEvidence),
    canonicalExpectedIntent: input.canonicalExpectedIntent,
    recoveryMode: input.recoveryMode,
    threadId: input.threadId,
    runId: input.runId,
    taskId: input.taskId,
    workerId: input.workerId,
    summary: input.comparable.terminalOutcome.summary,
    rejectionReason: input.comparable.approvalFlow.rejectionReason,
    artifactContext: input.artifactContext,
    pendingApprovalCount: input.comparable.terminalOutcome.pendingApprovalCount,
    unknownAfterCrashCount: input.comparable.sideEffects.unknownAfterCrashCount,
    milestones,
    comparable: input.comparable,
  });
}

export async function collectRealRunTrace(input: CollectRealRunTraceInput): Promise<RealRunTrace> {
  const thread = await input.ctx.stores.threadStore.get(input.threadId);
  if (!thread) {
    throw new Error(`thread ${input.threadId} not found for real-run trace collection`);
  }

  const runs = await input.ctx.stores.runStore.listByThread(input.threadId);
  const tasks = await input.ctx.stores.taskStore.listByThread(input.threadId);
  const approvals = await input.ctx.stores.approvalStore.listByThread(input.threadId);
  const events = await input.ctx.stores.eventLog.listByThread(input.threadId);
  const ledgerEntries = await input.ctx.stores.executionLedger.listByThread(input.threadId);
  const workers = await input.ctx.stores.workerStore.listByThread(input.threadId);

  const comparable = normalizeComparableRun({
    thread,
    runs,
    tasks,
    approvals,
    events,
    ledgerEntries,
  });
  const resolvedIdentity = resolveConsistentTraceIdentity({
    comparable,
    runId: input.runId,
    taskId: input.taskId,
  });

  return buildRealRunTrace({
    scenarioId: input.scenarioId,
    promptVariantId: input.promptVariantId,
    capabilityFamily: input.capabilityFamily,
    userGoal: input.userGoal,
    plannerEvidence: input.plannerEvidence,
    approvalPathEvidence: input.approvalPathEvidence,
    canonicalExpectedIntent: input.canonicalExpectedIntent,
    threadId: input.threadId,
    runId: resolvedIdentity.runId,
    taskId: resolvedIdentity.taskId,
    artifactContext: input.artifactContext,
    recoveryMode: input.recoveryMode,
    workerId: workers.at(-1)?.workerId,
    comparable,
  });
}
