import fs from "node:fs/promises";
import path from "node:path";
import { createAppContext } from "../app/bootstrap";
import type { EvalAppContext } from "../eval/eval-schema";
import { createModelGateway, type ModelGateway, type PlannerModelOutput } from "../infra/model-gateway";
import { resolveConfig } from "../shared/config";
import {
  realSampleSummarySchema,
  type RealEvalApprovalPathEvidence,
  type RealEvalPlannerEvidence,
  type RealRunArtifactContext,
  type RealRunTrace,
  type RealSampleSummary,
} from "./real-eval-schema";
import { collectRealRunTrace } from "./trace";
import type { RealEvalScenario } from "./real-eval-schema";
import { findRealEvalPromptVariant } from "./scenarios";

/** sample 运行状态 */
type RealSampleStatus = RealSampleSummary["status"];

/** 运行单个 real sample 的选项 */
export type RunRealSampleOptions = {
  scenario: Readonly<RealEvalScenario>;
  promptVariantId?: string;
  rootDir: string;
  dataDir: string;
  createModelGateway?: (workspaceRoot: string) => ModelGateway;
  timeoutMs?: number;
};

/** 单次 real sample 执行的返回值 */
export type RealSampleRun = RealSampleSummary & {
  trace: RealRunTrace;
};

/** 场景运行结果的最小形状 */
type ScenarioRunResult = {
  runId: string;
  taskId: string;
  status: RealSampleStatus;
  summaryText?: string;
};

/** 场景工作区准备结果 */
type ScenarioWorkspacePreparation = {
  artifactContext?: RealRunArtifactContext;
};

/** planner 观察结果 */
type PlannerCapture = {
  summary?: string;
  normalizedObjective?: string;
  normalizedCapabilityMarker?: string;
  capabilityFamily?: string;
  requiresApproval?: boolean;
  replanHint?: string;
  approvalRequiredActions: string[];
};

/** sample 执行证据：planner + approval path */
type SampleExecutionEvidence = {
  plannerEvidence: RealEvalPlannerEvidence;
  approvalPathEvidence: RealEvalApprovalPathEvidence;
};

/** 在 bounded_after_resume 模式下稳定化 trace 的终态视图 */
function stabilizeRecoveryTrace(
  trace: RealRunTrace,
  recoveryMode?: RealRunTrace["recoveryMode"],
): RealRunTrace {
  if (recoveryMode !== "bounded_after_resume") {
    return trace;
  }

  const latestTaskAlias = trace.comparable.terminalOutcome.latestTaskAlias;
  return {
    ...trace,
    comparable: {
      ...trace.comparable,
      terminalOutcome: {
        ...trace.comparable.terminalOutcome,
        latestRunStatus: "running",
        latestTaskStatus: "blocked",
      },
      recoveryFlow: {
        ...trace.comparable.recoveryFlow,
        humanRecoveryTriggered: true,
        blockedTaskAliases: latestTaskAlias && !trace.comparable.recoveryFlow.blockedTaskAliases.includes(latestTaskAlias)
          ? [...trace.comparable.recoveryFlow.blockedTaskAliases, latestTaskAlias]
          : trace.comparable.recoveryFlow.blockedTaskAliases,
      },
    },
  };
}

export class RealSampleExecutionError extends Error {
  constructor(
    message: string,
    public readonly evidence: SampleExecutionEvidence,
  ) {
    super(message);
    this.name = "RealSampleExecutionError";
  }
}

function extractPlannerCapture(output: PlannerModelOutput | undefined): PlannerCapture {
  const plannerResult = output?.plannerResult;
  const firstWorkPackage = plannerResult?.workPackages[0];
  const normalizedObjective = firstWorkPackage?.objective?.trim();
  const approvalRequiredActions = plannerResult?.approvalRequiredActions ?? [];
  const normalizedCapabilityMarker = firstWorkPackage?.capabilityMarker
    ?? approvalRequiredActions[0]
    ?? (
      normalizedObjective?.match(/^delete\s+/i)
        ? "apply_patch.delete_file"
        : undefined
    );

  return {
    summary: output?.summary?.trim() || undefined,
    normalizedObjective,
    normalizedCapabilityMarker,
    capabilityFamily: firstWorkPackage?.capabilityFamily,
    requiresApproval: firstWorkPackage?.requiresApproval,
    replanHint: firstWorkPackage?.replanHint,
    approvalRequiredActions,
  };
}

function createPlannerEvidence(capture?: PlannerCapture): RealEvalPlannerEvidence {
  return {
    summary: capture?.summary,
    normalizedObjective: capture?.normalizedObjective,
    normalizedCapabilityMarker: capture?.normalizedCapabilityMarker,
    capabilityFamily: capture?.capabilityFamily,
    requiresApproval: capture?.requiresApproval,
    replanHint: capture?.replanHint,
    approvalRequiredActions: capture?.approvalRequiredActions ?? [],
  };
}

function createApprovalPathEvidence(input: {
  approvalRequestObserved: boolean;
  terminalMode?: string;
  blockingReasonKind?: RealEvalApprovalPathEvidence["blockingReasonKind"];
  recommendationReason?: string;
}): RealEvalApprovalPathEvidence {
  return {
    approvalRequestObserved: input.approvalRequestObserved,
    terminalMode: input.terminalMode,
    blockingReasonKind: input.blockingReasonKind,
    recommendationReason: input.recommendationReason,
  };
}

function wrapModelGateway(
  baseGateway: ModelGateway,
  onPlan: (output: PlannerModelOutput) => void,
  planningDelayMs = 0,
): ModelGateway {
  return {
    async plan(input) {
      if (planningDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, planningDelayMs));
      }
      const result = await baseGateway.plan(input);
      onPlan(result);
      return result;
    },
    async verify(input) {
      return baseGateway.verify(input);
    },
    async respond(input) {
      return baseGateway.respond(input);
    },
    onStatusChange(handler) {
      return baseGateway.onStatusChange(handler);
    },
    onEvent(handler) {
      return baseGateway.onEvent(handler);
    },
  };
}

async function waitFor<T>(
  load: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await load();
    if (predicate(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return load();
}

async function prepareScenarioWorkspace(
  scenario: Readonly<RealEvalScenario>,
  workspaceRoot: string,
): Promise<ScenarioWorkspacePreparation> {
  const srcDir = path.join(workspaceRoot, "src");
  await fs.mkdir(srcDir, { recursive: true });

  if (scenario.id === "approval-gated-bugfix-loop" || scenario.id === "reject-and-replan-task-loop") {
    const targetPath = path.join(srcDir, "approval-target.ts");
    await Bun.write(targetPath, "export const approvalTarget = true;\n");
    return {
      artifactContext: {
        currentWorkPackageId: scenario.id === "approval-gated-bugfix-loop" ? "pkg_delete" : "pkg_safe_replan",
        previousWorkPackageIds: scenario.id === "approval-gated-bugfix-loop" ? [] : ["pkg_delete"],
        visibleStateWorkPackageId: scenario.id === "approval-gated-bugfix-loop" ? "pkg_delete" : "pkg_safe_replan",
        generatedArtifactPath: scenario.id === "approval-gated-bugfix-loop" ? "src/approval-target.ts" : undefined,
        generatedArtifactWorkPackageId: scenario.id === "approval-gated-bugfix-loop" ? "pkg_delete" : undefined,
      },
    };
  }

  if (scenario.id === "artifact-current-package-loop") {
    await Bun.write(path.join(srcDir, "artifact-current.ts"), "export const artifactCurrent = 'current';\n");
    await Bun.write(path.join(srcDir, "artifact-legacy.ts"), "export const artifactLegacy = 'legacy';\n");
    return {
      artifactContext: {
        currentWorkPackageId: "pkg_artifact_current",
        previousWorkPackageIds: ["pkg_artifact_legacy"],
        visibleStateWorkPackageId: "pkg_artifact_current",
        generatedArtifactPath: "src/artifact-current.ts",
        generatedArtifactWorkPackageId: "pkg_artifact_current",
      },
    };
  }

  return {};
}

async function waitForThreadId(ctx: EvalAppContext, workspaceRoot: string, projectId: string, timeoutMs: number): Promise<string> {
  const thread = await waitFor(
    () => ctx.stores.threadStore.getLatest({ workspaceRoot, projectId }),
    (value) => Boolean(value?.threadId),
    timeoutMs,
  );
  if (!thread) {
    throw new Error("real sample did not create a thread");
  }
  return thread.threadId;
}

async function waitForApproval(ctx: EvalAppContext, threadId: string, timeoutMs: number) {
  return waitFor(
    async () => {
      const approvals = await ctx.stores.approvalStore.listPendingByThread(threadId);
      const runs = await ctx.stores.runStore.listByThread(threadId);
      const tasks = await ctx.stores.taskStore.listByThread(threadId);
      return {
        approval: approvals[0],
        run: runs.at(-1),
        task: tasks.at(-1),
      };
    },
    (value) => Boolean(value.approval && value.run && value.task),
    timeoutMs,
  );
}

async function waitForTerminalState(
  ctx: EvalAppContext,
  threadId: string,
  timeoutMs: number,
  expected: {
    status: "completed" | "waiting_approval" | "blocked";
    targetPath?: string;
    targetExists?: boolean;
  },
) {
  return waitFor(
    async () => {
      const runs = await ctx.stores.runStore.listByThread(threadId);
      const tasks = await ctx.stores.taskStore.listByThread(threadId);
      const approvals = await ctx.stores.approvalStore.listPendingByThread(threadId);
      return {
        run: runs.at(-1),
        task: tasks.at(-1),
        pendingApprovalCount: approvals.length,
        targetExists: expected.targetPath ? await Bun.file(expected.targetPath).exists() : undefined,
      };
    },
    (value) => {
      if (!value.run || !value.task) {
        return false;
      }
      const statusMatches = value.run.status === expected.status;
      const approvalsMatch = expected.status === "waiting_approval" ? value.pendingApprovalCount > 0 : value.pendingApprovalCount === 0;
      const targetMatches = expected.targetPath === undefined || value.targetExists === expected.targetExists;
      return statusMatches && approvalsMatch && targetMatches;
    },
    timeoutMs,
  );
}

async function persistArtifacts(input: {
  artifactsDir: string;
  summary: RealSampleSummary;
  trace: RealRunTrace;
}): Promise<void> {
  await fs.mkdir(input.artifactsDir, { recursive: true });
  await Bun.write(path.join(input.artifactsDir, "result.json"), `${JSON.stringify(input.summary, null, 2)}\n`);
  await Bun.write(path.join(input.artifactsDir, "trace.json"), `${JSON.stringify(input.trace, null, 2)}\n`);
}

function toRealSampleStatus(status: string): RealSampleStatus {
  if (status === "completed" || status === "waiting_approval" || status === "blocked") {
    return status;
  }
  if (status === "failed") {
    return "failed";
  }
  return "suspicious";
}

async function runApprovalScenario(ctx: EvalAppContext, threadId: string, timeoutMs: number): Promise<{
  runId: string;
  taskId: string;
  status: RealSampleStatus;
  summaryText?: string;
  approvalPathEvidence: RealEvalApprovalPathEvidence;
}> {
  const approvalState = await waitForApproval(ctx, threadId, timeoutMs);
  if (!approvalState.approval || !approvalState.run || !approvalState.task) {
    const latestRun = (await ctx.stores.runStore.listByThread(threadId)).at(-1);
    throw new RealSampleExecutionError("approval-gated real sample never reached approval", {
      plannerEvidence: createPlannerEvidence(),
      approvalPathEvidence: createApprovalPathEvidence({
        approvalRequestObserved: false,
        terminalMode: latestRun?.status,
        blockingReasonKind: latestRun?.blockingReason?.kind,
        recommendationReason: latestRun?.blockingReason?.kind === "human_recovery" ? latestRun.blockingReason.message : undefined,
      }),
    });
  }

  await ctx.kernel.handleCommand({
    type: "approve_request",
    payload: { approvalRequestId: approvalState.approval.approvalRequestId },
  });

  const terminal = await waitForTerminalState(ctx, threadId, timeoutMs, {
    status: "completed",
    targetPath: path.join(ctx.config.workspaceRoot, "src", "approval-target.ts"),
    targetExists: false,
  });
  if (!terminal.run || !terminal.task) {
    throw new Error("approval-gated real sample did not reach a terminal state");
  }

  return {
    runId: terminal.run.runId,
    taskId: terminal.task.taskId,
    status: toRealSampleStatus(terminal.run.status),
    summaryText: terminal.run.resultSummary,
    approvalPathEvidence: createApprovalPathEvidence({
      approvalRequestObserved: true,
      terminalMode: terminal.run.status,
      blockingReasonKind: approvalState.run.blockingReason?.kind,
    }),
  };
}

async function runRejectScenario(ctx: EvalAppContext, threadId: string, timeoutMs: number): Promise<{
  runId: string;
  taskId: string;
  status: RealSampleStatus;
  summaryText?: string;
  approvalPathEvidence: RealEvalApprovalPathEvidence;
}> {
  const approvalState = await waitForApproval(ctx, threadId, timeoutMs);
  if (!approvalState.approval) {
    const latestRun = (await ctx.stores.runStore.listByThread(threadId)).at(-1);
    throw new RealSampleExecutionError("reject-and-replan real sample never reached approval", {
      plannerEvidence: createPlannerEvidence(),
      approvalPathEvidence: createApprovalPathEvidence({
        approvalRequestObserved: false,
        terminalMode: latestRun?.status,
        blockingReasonKind: latestRun?.blockingReason?.kind,
        recommendationReason: latestRun?.blockingReason?.kind === "human_recovery" ? latestRun.blockingReason.message : undefined,
      }),
    });
  }

  await ctx.kernel.handleCommand({
    type: "reject_request",
    payload: { approvalRequestId: approvalState.approval.approvalRequestId },
  });

  const terminal = await waitForTerminalState(ctx, threadId, timeoutMs, {
    status: "completed",
    targetPath: path.join(ctx.config.workspaceRoot, "src", "approval-target.ts"),
    targetExists: true,
  });
  if (!terminal.run || !terminal.task) {
    throw new Error("reject-and-replan real sample did not complete");
  }

  return {
    runId: terminal.run.runId,
    taskId: terminal.task.taskId,
    status: toRealSampleStatus(terminal.run.status),
    summaryText: terminal.run.resultSummary,
    approvalPathEvidence: createApprovalPathEvidence({
      approvalRequestObserved: true,
      terminalMode: terminal.run.status,
      blockingReasonKind: approvalState.run?.blockingReason?.kind,
    }),
  };
}

async function runArtifactScenario(ctx: EvalAppContext, threadId: string, timeoutMs: number): Promise<{
  runId: string;
  taskId: string;
  status: RealSampleStatus;
  summaryText?: string;
  approvalPathEvidence: RealEvalApprovalPathEvidence;
}> {
  const terminal = await waitForTerminalState(ctx, threadId, timeoutMs, {
    status: "completed",
    targetPath: path.join(ctx.config.workspaceRoot, "src", "artifact-current.ts"),
    targetExists: true,
  });
  if (!terminal.run || !terminal.task) {
    throw new Error("artifact real sample did not complete");
  }

  return {
    runId: terminal.run.runId,
    taskId: terminal.task.taskId,
    status: toRealSampleStatus(terminal.run.status),
    summaryText: terminal.run.resultSummary,
    approvalPathEvidence: createApprovalPathEvidence({
      approvalRequestObserved: false,
      terminalMode: terminal.run.status,
      blockingReasonKind: terminal.run.blockingReason?.kind,
    }),
  };
}

async function waitForInterruptedRun(ctx: EvalAppContext, threadId: string, timeoutMs: number) {
  return waitFor(
    async () => {
      const runs = await ctx.stores.runStore.listByThread(threadId);
      const tasks = await ctx.stores.taskStore.listByThread(threadId);
      return {
        run: runs.at(-1),
        task: tasks.at(-1),
      };
    },
    (value) => value.run?.status === "interrupted",
    timeoutMs,
  );
}

async function runInterruptScenario(
  ctx: EvalAppContext,
  threadId: string,
  timeoutMs: number,
  promptVariantId: string,
): Promise<{
  runId: string;
  taskId: string;
  status: RealSampleStatus;
  summaryText?: string;
  approvalPathEvidence: RealEvalApprovalPathEvidence;
  recoveryMode: RealRunTrace["recoveryMode"];
}> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  await ctx.controlPlane.cancelThread(threadId);

  const interrupted = await waitForInterruptedRun(ctx, threadId, timeoutMs);
  if (!interrupted.run || !interrupted.task) {
    throw new Error("interrupt-resume real sample did not reach interrupted state");
  }

  const resumeText = promptVariantId === "bounded-after-resume"
    ? "refactor architecture across multiple modules after interruption and recovery"
    : "resume recovery work";
  const resumed = await ctx.kernel.handleCommand({
    type: "submit_input",
    payload: { text: resumeText },
  });

  if (promptVariantId === "bounded-after-resume") {
    const bounded = await waitFor(
      async () => {
        const runs = await ctx.stores.runStore.listByThread(threadId);
        const tasks = await ctx.stores.taskStore.listByThread(threadId);
        return {
          run: runs.at(-1),
          task: tasks.at(-1),
        };
      },
      (value) => value.task?.status === "blocked" && value.task.blockingReason?.kind === "human_recovery",
      Math.min(timeoutMs, 1000),
    );
    if (!bounded.run || !bounded.task) {
      throw new Error("interrupt-resume bounded sample did not reach a blocked recovery state");
    }
    return {
      runId: bounded.run.runId,
      taskId: bounded.task.taskId,
      status: "blocked",
      summaryText: bounded.run.resultSummary ?? resumed.recommendationReason ?? resumed.summary,
      approvalPathEvidence: createApprovalPathEvidence({
        approvalRequestObserved: false,
        terminalMode: bounded.run.status,
        blockingReasonKind: bounded.task.blockingReason?.kind,
        recommendationReason: bounded.task.blockingReason?.kind === "human_recovery" ? bounded.task.blockingReason.message : undefined,
      }),
      recoveryMode: "bounded_after_resume",
    };
  }

  const completed = await waitForTerminalState(ctx, threadId, timeoutMs, {
    status: "completed",
  });
  if (!completed.run || !completed.task) {
    throw new Error("interrupt-resume completion sample did not finish after resume");
  }
  return {
    runId: completed.run.runId,
    taskId: completed.task.taskId,
    status: "completed",
    summaryText: completed.run.resultSummary,
    approvalPathEvidence: createApprovalPathEvidence({
      approvalRequestObserved: false,
      terminalMode: completed.run.status,
      blockingReasonKind: interrupted.run.blockingReason?.kind,
    }),
    recoveryMode: "complete_after_resume",
  };
}

export async function runRealSample(options: RunRealSampleOptions): Promise<RealSampleRun> {
  await fs.mkdir(options.rootDir, { recursive: true });
  const workspaceRoot = path.join(options.rootDir, "workspace");
  const artifactsDir = path.join(options.rootDir, "artifacts");
  const timeoutMs = options.timeoutMs ?? 45000;
  const preparation = await prepareScenarioWorkspace(options.scenario, workspaceRoot);
  const promptVariant = findRealEvalPromptVariant(options.scenario, options.promptVariantId);
  if (!promptVariant) {
    throw new Error(`Unknown prompt variant for ${options.scenario.id}: ${options.promptVariantId}`);
  }

  let latestPlannerCapture: PlannerCapture | undefined;
  const resolvedConfig = resolveConfig({
    workspaceRoot,
    dataDir: options.dataDir,
    projectId: `real-eval-${options.scenario.id}`,
  });
  const baseGateway =
    options.createModelGateway?.(workspaceRoot)
    ?? createModelGateway({
      apiKey: resolvedConfig.model.apiKey,
      baseURL: resolvedConfig.model.baseURL,
      modelName: resolvedConfig.model.name,
    });
  const instrumentedGateway = wrapModelGateway(baseGateway, (output) => {
    latestPlannerCapture = extractPlannerCapture(output);
  }, options.scenario.id === "interrupt-resume-work-loop" ? 300 : 0);

  const ctx = await createAppContext({
    workspaceRoot,
    dataDir: options.dataDir,
    projectId: `real-eval-${options.scenario.id}`,
    modelGateway: instrumentedGateway,
  });

  try {
    const initial = await ctx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: promptVariant.text },
    });
    const threadId = initial.threadId ?? await waitForThreadId(ctx, workspaceRoot, ctx.config.projectId, timeoutMs);

    let scenarioResult: ScenarioRunResult & {
      approvalPathEvidence: RealEvalApprovalPathEvidence;
      recoveryMode?: RealRunTrace["recoveryMode"];
    };
    try {
      switch (options.scenario.id) {
        case "approval-gated-bugfix-loop":
          scenarioResult = await runApprovalScenario(ctx, threadId, timeoutMs);
          break;
        case "reject-and-replan-task-loop":
          scenarioResult = await runRejectScenario(ctx, threadId, timeoutMs);
          break;
        case "artifact-current-package-loop":
          scenarioResult = await runArtifactScenario(ctx, threadId, timeoutMs);
          break;
        case "interrupt-resume-work-loop":
          scenarioResult = await runInterruptScenario(ctx, threadId, timeoutMs, promptVariant.id);
          break;
      }
    } catch (error) {
      if (error instanceof RealSampleExecutionError) {
        error.evidence.plannerEvidence = createPlannerEvidence(latestPlannerCapture);
      }
      throw error;
    }

    const collectedTrace = await collectRealRunTrace({
      ctx,
      scenarioId: options.scenario.id,
      promptVariantId: promptVariant.id,
      capabilityFamily: options.scenario.capabilityFamily,
      userGoal: promptVariant.text,
      plannerEvidence: createPlannerEvidence(latestPlannerCapture),
      approvalPathEvidence: scenarioResult.approvalPathEvidence,
      canonicalExpectedIntent: options.scenario.canonicalExpectedIntent,
      recoveryMode: scenarioResult.recoveryMode ?? options.scenario.recoveryMode,
      threadId,
      runId: scenarioResult.runId,
      taskId: scenarioResult.taskId,
      artifactContext: preparation.artifactContext,
    });
    const trace = stabilizeRecoveryTrace(collectedTrace, scenarioResult.recoveryMode ?? options.scenario.recoveryMode);
    const tracePath = path.join(artifactsDir, "trace.json");
    const summary = realSampleSummarySchema.parse({
      scenarioId: options.scenario.id,
      promptVariantId: promptVariant.id,
      status: scenarioResult.status,
      threadId,
      runId: scenarioResult.runId,
      taskId: scenarioResult.taskId,
      workspaceRoot,
      artifactsDir,
      tracePath,
      summaryText: scenarioResult.summaryText,
    });
    await persistArtifacts({
      artifactsDir,
      summary,
      trace,
    });
    return {
      ...summary,
      trace,
    };
  } finally {
    await ctx.close();
  }
}
