import { resolve } from "node:path";
import type { Database } from "bun:sqlite";
import { createApprovalService, type ApprovalService, type CreateApprovalInput } from "../control/policy/approval-service";
import { createPolicyEngine } from "../control/policy/policy-engine";
import { createTaskManager } from "../control/tasks/task-manager";
import { createControlTask, type ControlTask } from "../control/tasks/task-types";
import { createToolRegistry } from "../control/tools/tool-registry";
import type { ContinuationEnvelope } from "../harness/core/run-loop/continuation";
import {
  isApprovalResolutionContinuation,
  isPlanDecisionContinuation,
} from "../harness/core/run-loop/continuation";
import { buildPlanDecisionContinuation } from "../harness/core/run-loop/approval-suspension";
import { createRunLoopEngine } from "../harness/core/run-loop/run-loop-engine";
import type { RunLoopState } from "../harness/core/run-loop/step-types";
import { createSessionKernel, type SessionControlPlaneResult } from "../harness/core/session/session-kernel";
import { createSqlite } from "../persistence/sqlite/sqlite-client";
import { migrateSqlite } from "../persistence/sqlite/sqlite-migrator";
import { SqliteApprovalStore } from "../persistence/sqlite/sqlite-approval-store";
import { SqliteEventLog } from "../persistence/sqlite/sqlite-event-log";
import { SqliteMemoryStore } from "../persistence/sqlite/sqlite-memory-store";
import { SqliteRunStore } from "../persistence/sqlite/sqlite-run-store";
import { SqliteRunStateStore } from "../persistence/sqlite/sqlite-run-state-store";
import { SqliteTaskStore } from "../persistence/sqlite/sqlite-task-store";
import { SqliteThreadStore } from "../persistence/sqlite/sqlite-thread-store";
import { SqliteExecutionLedger } from "../persistence/sqlite/sqlite-execution-ledger";
import { SqliteAgentRunStore } from "../persistence/sqlite/sqlite-agent-run-store";
import { createModelGateway, type ModelGateway } from "../infra/model-gateway";
import { resolveConfig } from "../shared/config";
import { createThreadNarrativeService } from "../control/context/thread-narrative-service";
import { createAgentRunScratchPolicy } from "../control/context/agent-run-scratch-policy";
import { createAgentRunManager } from "../control/agent-runs/agent-run-manager";
import { createPassiveAgentRunRuntimeFactory } from "../control/agent-runs/agent-run-runtime";
import { MemoryConsolidator } from "../control/context/memory-consolidator";
import { transitionThread } from "../domain/thread";
import { createEvent } from "../domain/event";
import { createRun, transitionRun, type Run } from "../domain/run";
import { prefixedUuid } from "../shared/id-generators";
import { normalizePlannerOutput } from "../runtime/planning/planner-normalization";
import type { PlanDecisionRequest } from "../runtime/planning/planner-result";
import type { WorkPackage } from "../runtime/planning/work-package";
import {
  buildApprovedExecutionArtifacts,
  buildExecutionArtifacts,
  buildExecutionInput,
  buildVerifierPrompt,
} from "./agent-run-inputs";
import {
  buildFinalResponderPrompt,
  buildPlannerPrompt,
  ensureControlTask,
  isCancelledError,
  resolveApprovalToolRequest,
  saveTaskStatus,
  summarizeApprovedAction,
} from "./control-plane-support";
import {
  resolveApprovedRequest,
  resolveRejectedRequest,
} from "./control-plane-approval-resolution";
import {
  finalizeRootTaskExecution,
  prepareRootTaskExecution,
} from "./control-plane-run-lifecycle";
import { calculateRunStateAuditCutoff } from "./runtime-gc";
import {
  bridgeModelGatewayEvents,
  closeAppContextResources,
  createAppPersistenceLayer,
  createAppServiceLayer,
  resolveAppModelGateway,
} from "./app-context-assembly";

type AppStores = ReturnType<typeof createStores>;

type ControlPlane = {
  startRootTask(threadId: string, input: string | ContinuationEnvelope): Promise<SessionControlPlaneResult>;
  resolvePlanDecision(input: {
    threadId: string;
    runId: string;
    optionId: string;
    optionLabel: string;
    continuationInput: string;
  }): Promise<SessionControlPlaneResult>;
  approveRequest(approvalRequestId: string): Promise<SessionControlPlaneResult>;
  rejectRequest(approvalRequestId: string): Promise<SessionControlPlaneResult>;
  restartRun(threadId: string): Promise<SessionControlPlaneResult>;
  abandonRun(threadId: string): Promise<SessionControlPlaneResult>;
  cancelThread(threadId: string, reason?: string): Promise<boolean>;
  attachKernelEventPublisher(
    publisher: (event: {
      type:
        | "loop.step_started"
        | "loop.step_completed"
        | "loop.step_failed"
        | "loop.suspended"
        | "loop.resumed"
        | "loop.finished";
      payload: Record<string, unknown>;
    }) => void,
  ): void;
};

const LEGACY_CHECKPOINT_INVALIDATION_MIGRATION = "legacy_checkpoint_invalidation_v1";

function attachPlanDecisionSource(
  decision: PlanDecisionRequest,
  sourceInput: string,
): PlanDecisionRequest {
  return {
    ...decision,
    sourceInput: decision.sourceInput ?? sourceInput,
  };
}


function createStores(path: string | ReturnType<typeof createSqlite>) {
  return {
    threadStore: new SqliteThreadStore(path),
    runStore: new SqliteRunStore(path),
    taskStore: new SqliteTaskStore(path),
    approvalStore: new SqliteApprovalStore(path),
    eventLog: new SqliteEventLog(path),
    memoryStore: new SqliteMemoryStore(path),
    runStateStore: new SqliteRunStateStore(path),
    executionLedger: new SqliteExecutionLedger(path),
    agentRunStore: new SqliteAgentRunStore(path),
  };
}

function hasSystemMigration(sqlite: Database, migrationKey: string): boolean {
  const row = sqlite
    .query<{ count: number }, [string]>(
      `SELECT COUNT(*) as count
       FROM system_migrations
       WHERE migration_key = ?`,
    )
    .get(migrationKey);
  return (row?.count ?? 0) > 0;
}

function markSystemMigration(sqlite: Database, migrationKey: string): void {
  sqlite.run(
    `INSERT OR REPLACE INTO system_migrations (migration_key, applied_at)
     VALUES (?, ?)`,
    [migrationKey, new Date().toISOString()],
  );
}

async function recoverUncertainExecutions(stores: AppStores, scope: { workspaceRoot: string; projectId: string }) {
  const threads = await stores.threadStore.listByScope(scope);

  for (const thread of threads) {
    const uncertainExecutions = await stores.executionLedger.findUncertain(thread.threadId);
    const crashUncertainExecutions = uncertainExecutions.filter((execution) => execution.status === "started");
    if (crashUncertainExecutions.length === 0) {
      continue;
    }

    const now = new Date().toISOString();

    let recoveryBlockingReason:
      | {
          kind: "human_recovery";
          message: string;
        }
      | undefined;

    for (const execution of crashUncertainExecutions) {
      await stores.executionLedger.save({
        ...execution,
        status: "unknown_after_crash",
        updatedAt: now,
      });

      const existingTask = await stores.taskStore.get(execution.taskId);
      if (existingTask) {
        const blockingReason = {
          kind: "human_recovery" as const,
          message: `Manual recovery required for ${execution.toolName}; previous execution outcome is uncertain after a crash.`,
        };
        await stores.taskStore.save({
          ...existingTask,
          status: "blocked",
          blockingReason,
        });
        recoveryBlockingReason ??= blockingReason;
        await stores.eventLog.append(
          createEvent({
            eventId: `event_${crypto.randomUUID()}`,
            threadId: existingTask.threadId,
            taskId: existingTask.taskId,
            type: "task.updated",
            payload: {
              ...existingTask,
              status: "blocked",
              blockingReason,
            },
            createdAt: now,
          }),
        );
      }
    }

    const recoveredThread =
      thread.status === "active"
        ? {
            ...thread,
            revision: (thread.revision ?? 1) + 1,
          }
        : {
            ...transitionThread(thread, "active"),
            revision: (thread.revision ?? 1) + 1,
          };
    await stores.threadStore.save(recoveredThread);
    await stores.eventLog.append(
      createEvent({
        eventId: `event_${crypto.randomUUID()}`,
        threadId: recoveredThread.threadId,
        type: "thread.blocked",
        payload: {
          threadId: recoveredThread.threadId,
          status: recoveredThread.status,
          blockingReason: recoveryBlockingReason,
        },
        createdAt: now,
      }),
    );
  }
}

async function invalidateLegacyCheckpointThreads(
  sqlite: Database,
  stores: AppStores,
  scope: { workspaceRoot: string; projectId: string },
) {
  if (hasSystemMigration(sqlite, LEGACY_CHECKPOINT_INVALIDATION_MIGRATION)) {
    return;
  }

  type CheckpointThreadRow = { thread_id: string };

  let rows: CheckpointThreadRow[];
  try {
    rows = sqlite
      .query<CheckpointThreadRow, []>("SELECT DISTINCT thread_id FROM checkpoints")
      .all();
  } catch {
    return;
  }

  if (rows.length === 0) {
    markSystemMigration(sqlite, LEGACY_CHECKPOINT_INVALIDATION_MIGRATION);
    return;
  }

  const now = new Date().toISOString();
  const message = "Legacy graph checkpoint invalidated. Please resubmit your intent to continue safely.";

  for (const row of rows) {
    const thread = await stores.threadStore.get(row.thread_id);
    if (thread) {
      const latestRun = await stores.runStore.getLatestByThread(row.thread_id);
      if (latestRun) {
        await stores.runStore.save({
          ...latestRun,
          status: "blocked",
          blockingReason: {
            kind: "human_recovery",
            message,
          },
          endedAt: undefined,
        });
      }

      const tasks = await stores.taskStore.listByThread(row.thread_id);
      const latestTask = tasks[tasks.length - 1];
      if (latestTask) {
        await stores.taskStore.save({
          ...latestTask,
          status: "blocked",
          blockingReason: {
            kind: "human_recovery",
            message,
          },
        });
      }

      await stores.threadStore.save({
        ...thread,
        status: "active",
        revision: (thread.revision ?? 1) + 1,
        recoveryFacts: thread.recoveryFacts
          ? {
              ...thread.recoveryFacts,
              status: "blocked",
              updatedAt: now,
              blocking: latestTask
                ? {
                    sourceTaskId: latestTask.taskId,
                    kind: "human_recovery",
                    message,
                  }
                : thread.recoveryFacts.blocking,
            }
          : thread.recoveryFacts,
      });

      await stores.eventLog.append(
        createEvent({
          eventId: `event_${crypto.randomUUID()}`,
          threadId: row.thread_id,
          taskId: latestTask?.taskId,
          type: "thread.blocked",
          payload: {
            threadId: row.thread_id,
            status: "blocked",
            blockingReason: {
              kind: "human_recovery",
              message,
            },
          },
          createdAt: now,
        }),
      );
    }

    sqlite.run("DELETE FROM writes WHERE thread_id = ?", [row.thread_id]);
    sqlite.run("DELETE FROM checkpoints WHERE thread_id = ?", [row.thread_id]);
  }

  markSystemMigration(sqlite, LEGACY_CHECKPOINT_INVALIDATION_MIGRATION);
}

function createPersistentApprovalService(stores: AppStores): ApprovalService {
  const approvals = createApprovalService();

  return {
    ...approvals,
    async createPending(request: CreateApprovalInput) {
      // Check if a pending request already exists for this tool call
      const existing = await stores.approvalStore.listPendingByThread(request.threadId);
      const found = existing.find((r) => r.toolCallId === request.toolCallId);
      if (found) {
        return found;
      }

      const approval = await approvals.createPending(request);
      await stores.approvalStore.save(approval);
      return approval;
    },
    async get(approvalRequestId: string) {
      return stores.approvalStore.get(approvalRequestId);
    },
    async listPendingByThread(threadId: string) {
      return stores.approvalStore.listPendingByThread(threadId);
    },
    async updateStatus(approvalRequestId, status) {
      const updated = await approvals.updateStatus(approvalRequestId, status);
      const persisted = updated ?? (await stores.approvalStore.get(approvalRequestId));
      if (!persisted) {
        return undefined;
      }

      const next = { ...persisted, status };
      await stores.approvalStore.save(next);
      return next;
    },
  };
}

function parseDeleteRequest(input: string, workspaceRoot: string) {
  const match = input.trim().match(/^delete\s+(.+)$/i);
  if (!match) {
    return undefined;
  }

  const relativePath = match[1]?.trim();
  if (!relativePath) {
    return undefined;
  }

  return {
    relativePath,
    absolutePath: resolve(workspaceRoot, relativePath),
  };
}

function resolveCurrentWorkPackage(state: {
  workPackages?: WorkPackage[];
  currentWorkPackageId?: string;
}) {
  const workPackages = state.workPackages ?? [];
  const currentWorkPackageId = state.currentWorkPackageId ?? workPackages[0]?.id;
  return workPackages.find((item) => item.id === currentWorkPackageId);
}

function resolveArtifactsForCurrentWorkPackage(state: {
  currentWorkPackageId?: string;
  artifacts?: RunLoopState["artifacts"];
  latestArtifacts?: RunLoopState["latestArtifacts"];
}) {
  if (!state.currentWorkPackageId) {
    return [];
  }

  return [...(state.artifacts ?? []), ...(state.latestArtifacts ?? [])].filter(
    (artifact) => artifact.workPackageId === state.currentWorkPackageId,
  );
}

async function createControlPlane(input: {
  config: ReturnType<typeof resolveConfig>;
  stores: AppStores;
  modelGateway: ModelGateway;
}): Promise<ControlPlane> {
  // control-plane 边界：approval、tool policy、task 生命周期、run 状态和
  // run-loop 执行都在这里汇合，然后才会被投影到 UI。
  const taskManager = createTaskManager({
    taskStore: input.stores.taskStore,
    eventLog: input.stores.eventLog,
  });
  const approvals = createPersistentApprovalService(input.stores);
  const toolRegistry = createToolRegistry({
    policy: createPolicyEngine({
      workspaceRoot: input.config.workspaceRoot,
      permissionMode: input.config.permission.defaultMode,
      additionalDirectories: input.config.permission.additionalDirectories,
    }),
    approvals,
    executionLedger: input.stores.executionLedger,
  });
  const activeExecutions = new Map<string, { taskId: string; controller: AbortController }>();
  const getAbortSignal = (threadId?: string) => (threadId ? activeExecutions.get(threadId)?.controller.signal : undefined);
  let kernelEventPublisher:
    | ((
        event: {
          type:
            | "loop.step_started"
            | "loop.step_completed"
            | "loop.step_failed"
            | "loop.suspended"
            | "loop.resumed"
            | "loop.finished";
          payload: Record<string, unknown>;
        },
      ) => void)
    | undefined;

  async function saveRun(run: Run): Promise<Run> {
    await input.stores.runStore.save(run);
    return run;
  }

  async function updateRunStatus(run: Run, status: Run["status"], patch?: Partial<Run>): Promise<Run> {
    const transitioned = run.status === status ? run : transitionRun(run, status);
    const next: Run = {
      ...transitioned,
      ...patch,
      endedAt:
        status === "completed" || status === "failed"
          ? patch?.endedAt ?? transitioned.endedAt ?? new Date().toISOString()
          : patch?.endedAt ?? transitioned.endedAt,
    };
    return await saveRun(next);
  }

  async function cancelPendingApprovalsForRun(threadId: string, runId: string): Promise<void> {
    const pendingApprovals = await approvals.listPendingByThread(threadId);
    await Promise.all(
      pendingApprovals
        .filter((approval) => approval.runId === runId)
        .map((approval) => approvals.updateStatus(approval.approvalRequestId, "cancelled")),
    );
  }

  async function resolveTaskForRun(threadId: string, run: Run): Promise<ControlTask | undefined> {
    if (run.activeTaskId) {
      const activeTask = await input.stores.taskStore.get(run.activeTaskId);
      if (activeTask) {
        return ensureControlTask(activeTask);
      }
    }

    const tasks = await input.stores.taskStore.listByThread(threadId);
    const lastTask = tasks.at(-1);
    return lastTask ? ensureControlTask(lastTask) : undefined;
  }

  async function buildCurrentControlPlaneResult(args: {
    threadId: string;
    run: Run;
    resumeDisposition?: SessionControlPlaneResult["resumeDisposition"];
    fallbackTaskSummary: string;
  }): Promise<SessionControlPlaneResult> {
    const tasks = await input.stores.taskStore.listByThread(args.threadId);
    const currentTask = tasks.at(-1);
    const fallbackBlockingReason =
      args.run.blockingReason?.kind === "waiting_approval"
      || args.run.blockingReason?.kind === "plan_decision"
      || args.run.blockingReason?.kind === "human_recovery"
        ? {
            kind: args.run.blockingReason.kind,
            message: args.run.blockingReason.message,
          }
        : undefined;
    const task = currentTask
      ? ensureControlTask(currentTask)
      : createControlTask({
          taskId: prefixedUuid("task"),
          threadId: args.threadId,
          runId: args.run.runId,
          summary: args.fallbackTaskSummary,
          status: args.run.status === "waiting_approval" ? "blocked" : args.run.status === "blocked" ? "blocked" : "completed",
          blockingReason: fallbackBlockingReason,
        });
    const approvals = await input.stores.approvalStore.listPendingByThread(args.threadId);

    return {
      status:
        args.run.status === "waiting_approval"
          ? "waiting_approval"
          : "completed",
      task,
      approvals,
      resumeDisposition: args.resumeDisposition,
      finalResponse: args.run.resultSummary,
      executionSummary: args.run.resultSummary,
      pauseSummary: args.run.blockingReason?.message,
      recommendationReason:
        args.run.blockingReason?.kind === "human_recovery"
          ? args.run.blockingReason.message
          : undefined,
    };
  }

  async function resolveBlockedRecoveryRun(threadId: string): Promise<{
    run: Run;
    task: ControlTask;
  }> {
    const activeRun = await input.stores.runStore.getLatestByThread(threadId);
    if (!activeRun) {
      throw new Error(`no run found for thread ${threadId}`);
    }
    if (activeRun.blockingReason?.kind !== "human_recovery" && activeRun.status !== "blocked") {
      throw new Error(`thread ${threadId} is not in human_recovery`);
    }
    const tasks = await input.stores.taskStore.listByThread(threadId);
    const lastTask = tasks.at(-1);
    if (!lastTask) {
      throw new Error(`no task found for thread ${threadId}`);
    }
    return {
      run: activeRun,
      task: ensureControlTask(lastTask),
    };
  }

  async function cancelActiveThread(threadId: string): Promise<boolean> {
    const execution = activeExecutions.get(threadId);
    const activeRun = await input.stores.runStore.getLatestByThread(threadId);
    if (!execution) {
      if (
        activeRun &&
        ["created", "running", "waiting_approval", "blocked"].includes(activeRun.status)
      ) {
        const currentTask = await resolveTaskForRun(threadId, activeRun);
        if (currentTask && !["completed", "failed", "cancelled"].includes(currentTask.status)) {
          await saveTaskStatus(input.stores, currentTask, "cancelled");
        }
        await cancelPendingApprovalsForRun(threadId, activeRun.runId);
        await input.stores.runStateStore.invalidateRunRecoveryArtifacts({
          runId: activeRun.runId,
          reason: "cancelled by user",
        });
        await input.stores.runStateStore.deleteActiveRunState(activeRun.runId);
        await updateRunStatus(activeRun, "interrupted", {
          endedAt: new Date().toISOString(),
          resultSummary: "Interrupted from TUI",
        });
        return true;
      }
      return false;
    }

    execution.controller.abort();

    const existingTask = await input.stores.taskStore.get(execution.taskId);
    if (existingTask && !["completed", "failed", "cancelled"].includes(existingTask.status)) {
      await saveTaskStatus(input.stores, ensureControlTask(existingTask), "cancelled");
    }

    if (activeRun && activeRun.status !== "interrupted") {
      await cancelPendingApprovalsForRun(threadId, activeRun.runId);
      await input.stores.runStateStore.invalidateRunRecoveryArtifacts({
        runId: activeRun.runId,
        reason: "cancelled by user",
      });
      await input.stores.runStateStore.deleteActiveRunState(activeRun.runId);
      await updateRunStatus(activeRun, "interrupted", {
        endedAt: new Date().toISOString(),
        resultSummary: "Interrupted from TUI",
      });
    }

    const thread = await input.stores.threadStore.get(threadId);
    if (thread && thread.status !== "active") {
      const nextThread = {
        ...transitionThread(thread, "active"),
        revision: (thread.revision ?? 1) + 1,
      };
      await input.stores.threadStore.save(nextThread);
    }

    return true;
  }

  const runLoopEngine = createRunLoopEngine({
    runStateStore: input.stores.runStateStore,
    emitRuntimeEvent: (event) => {
      kernelEventPublisher?.(event);
    },
    planner: async (state) => {
      const text = state.input;
      const threadId = state.threadId;
      const taskId = state.taskId;
      const threadView = threadId ? await input.stores.threadStore.get(threadId) : undefined;
      const memories = await input.stores.memoryStore.search("project", { limit: 5 });
      const prompt = buildPlannerPrompt({
        text,
        threadView,
        projectMemory: memories.map((memory) => memory.value),
      });
      const result = await input.modelGateway.plan({ prompt, threadId, taskId, signal: getAbortSignal(threadId) });
      const normalized = normalizePlannerOutput({
        inputText: text,
        summary: result.summary,
        plannerResult: result.plannerResult,
      });
      const planDecision = normalized.plannerResult.decisionRequest
        ? attachPlanDecisionSource(normalized.plannerResult.decisionRequest, text)
        : undefined;

      if (planDecision) {
        return {
          plannerResult: normalized.plannerResult,
          workPackages: normalized.plannerResult.workPackages,
          currentWorkPackageId: normalized.plannerResult.workPackages[0]?.id,
          planDecision,
          nextStep: "waiting_plan_decision" as const,
        };
      }

      return {
        plannerResult: normalized.plannerResult,
        workPackages: normalized.plannerResult.workPackages,
        currentWorkPackageId: normalized.plannerResult.workPackages[0]?.id,
        nextStep: normalized.plannerResult.workPackages.length > 0 ? "execute" : "respond",
      };
    },
    verifier: async (state) => {
      const text = state.input;
      const threadId = state.threadId;
      const taskId = state.taskId;
      const currentWorkPackage = resolveCurrentWorkPackage(state);
      const artifacts = resolveArtifactsForCurrentWorkPackage(state);
      const plannerResult = state.plannerResult;
      const prompt = buildVerifierPrompt({
        input: text,
        currentWorkPackage,
        artifacts,
        plannerResult,
      });
      const result = await input.modelGateway.verify({ prompt, threadId, taskId, signal: getAbortSignal(threadId) });
      return {
        verificationSummary: result.summary,
        verificationReport: {
          summary: result.summary,
          passed: result.isValid,
          feedback: result.summary,
        },
      };
    },
    executor: async (state) => {
      const text = state.input;
      const threadId = state.threadId;
      const taskId = state.taskId;
      const currentWorkPackage = resolveCurrentWorkPackage(state);
      const plannerResult = state.plannerResult;
      const artifacts = resolveArtifactsForCurrentWorkPackage(state);
      const approvedApprovalRequestId = state.approvedApprovalRequestId;
      const executionInput = buildExecutionInput({
        input: text,
        currentWorkPackage,
        artifacts,
        plannerResult,
      });
      const resumedApprovalRequestId = approvedApprovalRequestId;
      if (resumedApprovalRequestId) {
        const approval = await approvals.get(resumedApprovalRequestId);
        const approvedToolRequest = resolveApprovalToolRequest(approval, input.config.workspaceRoot);
        if (approvedToolRequest && threadId && taskId) {
          const approvedOutcome = await toolRegistry.executeApproved(approvedToolRequest);
          if (approvedOutcome.kind !== "executed") {
            return {
              executionSummary: `Unable to complete approved action: ${approvedOutcome.reason}`,
              approvedApprovalRequestId: resumedApprovalRequestId,
              nextStep: "respond" as const,
            };
          }

          const approvedSummary = summarizeApprovedAction(
            approval?.summary ?? `Executed approved action: ${executionInput}`,
            input.config.workspaceRoot,
            approvedToolRequest.path,
          );
          await input.stores.eventLog.append({
            eventId: `event_${crypto.randomUUID()}`,
            threadId,
            taskId,
            type: "tool.executed",
            payload: { summary: approvedSummary, output: approvedOutcome.output },
            createdAt: new Date().toISOString(),
          });
          return {
            executionSummary: approvedSummary,
            approvedApprovalRequestId: resumedApprovalRequestId,
            latestArtifacts: buildApprovedExecutionArtifacts({
              workspaceRoot: input.config.workspaceRoot,
              toolRequest: approvedToolRequest,
              summary: approvedSummary,
              currentWorkPackage,
            }),
            lastCompletedToolCallId: approvedToolRequest.toolCallId,
            lastCompletedToolName: approvedToolRequest.toolName,
            nextStep: "verify" as const,
          };
        }
      }
      const normalizedMarker = currentWorkPackage?.capabilityMarker;
      const useLegacyObjectiveFallback = normalizedMarker === undefined;
      const deleteRequest = normalizedMarker === "respond_only"
        ? undefined
        : parseDeleteRequest(executionInput, input.config.workspaceRoot);
      if (!deleteRequest || !threadId || !taskId) {
        const summary = `Executed request: ${executionInput}`;
        return {
          executionSummary: summary,
          approvedApprovalRequestId,
          latestArtifacts: buildExecutionArtifacts({
            summary: useLegacyObjectiveFallback ? `${summary} (legacy objective fallback)` : summary,
            currentWorkPackage,
          }),
          nextStep: "verify" as const,
        };
      }

      const currentTask = await input.stores.taskStore.get(taskId);

      const outcome = await toolRegistry.execute({
        toolCallId: `${taskId}:apply_patch`,
        threadId,
        runId: currentTask?.runId,
        taskId,
        toolName: "apply_patch",
        action: "delete_file",
        path: deleteRequest.absolutePath,
        changedFiles: 1,
        args: {},
      });

      if (outcome.kind === "blocked") {
        const summary = `Approval required before deleting ${deleteRequest.relativePath}`;
        return {
          executionSummary: summary,
          approvedApprovalRequestId,
          pendingToolCallId: `${taskId}:apply_patch`,
          pendingToolName: "apply_patch",
          pendingApproval: {
            summary,
            approvalRequestId: outcome.approvalRequest.approvalRequestId,
          },
          nextStep: "waiting_approval" as const,
        };
      }

      if (outcome.kind === "executed") {
        const summary = `Deleted ${deleteRequest.relativePath}`;
        
        await input.stores.eventLog.append({
          eventId: `event_${crypto.randomUUID()}`,
          threadId: threadId!,
          taskId,
          type: "tool.executed",
          payload: { summary, output: outcome.output },
          createdAt: new Date().toISOString(),
        });
        return {
          executionSummary: summary,
          approvedApprovalRequestId,
          latestArtifacts: buildExecutionArtifacts({
            summary,
            currentWorkPackage,
            changedPath: deleteRequest.relativePath,
          }),
          lastCompletedToolCallId: `${taskId}:apply_patch`,
          lastCompletedToolName: "apply_patch",
          nextStep: "verify" as const,
        };
      }

      const errorSummary = `Unable to delete ${deleteRequest.relativePath}: ${outcome.reason}`;
      await input.stores.eventLog.append({
        eventId: `event_${crypto.randomUUID()}`,
        threadId: threadId!,
        taskId,
        type: "tool.failed",
        payload: { summary: errorSummary },
        createdAt: new Date().toISOString(),
      });
      return {
        executionSummary: errorSummary,
        approvedApprovalRequestId,
        nextStep: "respond" as const,
      };
    },
    responder: async (state) => {
      const text = state.input;
      const threadId = state.threadId;
      const taskId = state.taskId;
      const artifacts = [...(state.artifacts ?? []), ...(state.latestArtifacts ?? [])];
      const plannerResult = state.plannerResult;
      const verificationReport = state.verificationReport;
      const threadView = threadId ? await input.stores.threadStore.get(threadId) : undefined;
      const prompt = buildFinalResponderPrompt({
        text,
        threadView,
        artifacts,
        plannerResult,
        verificationReport,
      });
      const result = await input.modelGateway.respond({
        prompt,
        threadId,
        taskId,
        signal: getAbortSignal(threadId),
      });
      return {
        finalResponse: result.summary,
        nextStep: "done" as const,
      };
    },
  });

  const controlPlane: ControlPlane = {
    async startRootTask(threadId: string, inputValue: string | ContinuationEnvelope): Promise<SessionControlPlaneResult> {
      const thread = await input.stores.threadStore.get(threadId);
      if (!thread) {
        throw new Error(`thread ${threadId} not found`);
      }

      const prepared = await prepareRootTaskExecution(
        {
          getLatestRun: (targetThreadId) => input.stores.runStore.getLatestByThread(targetThreadId),
          listTasksByThread: (targetThreadId) => input.stores.taskStore.listByThread(targetThreadId),
          saveRun,
          updateRunStatus,
          createRootTask: (targetThreadId, summary, runId) => taskManager.createRootTask(targetThreadId, summary, runId),
          saveTaskStatus: (task, status) => saveTaskStatus(input.stores, task, status),
        },
        threadId,
        inputValue,
      );

      const { isResume, run, task } = prepared;
      let engineResult: Awaited<ReturnType<typeof runLoopEngine.start>>;
      const controller = new AbortController();
      activeExecutions.set(threadId, { taskId: task.taskId, controller });

      try {
        if (typeof inputValue !== "string") {
          if (!isApprovalResolutionContinuation(inputValue) && !isPlanDecisionContinuation(inputValue)) {
            throw new Error(`unsupported continuation kind for run-loop resume: ${inputValue.kind}`);
          }
          engineResult = await runLoopEngine.resume({
            threadId,
            runId: run.runId,
            taskId: task.taskId,
            continuation: inputValue,
          });
        } else {
          engineResult = await runLoopEngine.start({
            threadId,
            runId: run.runId,
            taskId: task.taskId,
            input: prepared.text,
          });
        }
      } catch (error: unknown) {
        if (isCancelledError(error)) {
          throw error;
        }
        throw error;
      } finally {
        if (activeExecutions.get(threadId)?.controller === controller) {
          activeExecutions.delete(threadId);
        }
      }

      const finalizationResult = await finalizeRootTaskExecution(
        {
          listPendingApprovals: (targetThreadId) => input.stores.approvalStore.listPendingByThread(targetThreadId),
          saveTaskStatus: (nextTask, status) => saveTaskStatus(input.stores, nextTask, status),
          updateRunStatus,
        },
        inputValue,
        threadId,
        run,
        task,
        engineResult,
      );

      return finalizationResult.status === "blocked"
        ? { ...finalizationResult, status: "completed" as const }
        : { ...finalizationResult, status: finalizationResult.status === "waiting_approval" ? "waiting_approval" as const : "completed" as const };
    },

    async resolvePlanDecision(decisionInput) {
      const run = await input.stores.runStore.get(decisionInput.runId);
      if (!run || run.threadId !== decisionInput.threadId) {
        throw new Error(`run ${decisionInput.runId} not found for thread ${decisionInput.threadId}`);
      }

      const suspension = await input.stores.runStateStore.loadActiveSuspensionByRun(run.runId);
      if (!suspension || suspension.reasonKind !== "waiting_plan_decision") {
        throw new Error(`run ${run.runId} is not waiting for a plan decision`);
      }

      return controlPlane.startRootTask(
        decisionInput.threadId,
        buildPlanDecisionContinuation({
          threadId: decisionInput.threadId,
          runId: run.runId,
          taskId: run.activeTaskId ?? suspension.taskId,
          optionId: decisionInput.optionId,
          optionLabel: decisionInput.optionLabel,
          input: decisionInput.continuationInput,
        }),
      );
    },

    async approveRequest(approvalRequestId: string) {
      return resolveApprovedRequest(
        {
          workspaceRoot: input.config.workspaceRoot,
          approvals,
          getRun: (runId) => input.stores.runStore.get(runId),
          getTask: async (taskId) => {
            const task = await input.stores.taskStore.get(taskId);
            return task ? ensureControlTask(task) : undefined;
          },
          listPendingApprovals: (threadId) => input.stores.approvalStore.listPendingByThread(threadId),
          saveTaskStatus: (task, status) => saveTaskStatus(input.stores, task, status),
          updateRunStatus,
          executeApprovedTool: (request) => toolRegistry.executeApproved(request),
          hasSuspension: async (runId) =>
            (await input.stores.runStateStore.loadActiveSuspensionByRun(runId)) !== undefined,
          buildCurrentResult: ({ threadId: targetThreadId, run, resumeDisposition, fallbackTaskSummary }) =>
            buildCurrentControlPlaneResult({
              threadId: targetThreadId,
              run,
              resumeDisposition,
              fallbackTaskSummary,
            }),
          startRootTask: (threadId, resumeInput) => controlPlane.startRootTask(threadId, resumeInput),
        },
        approvalRequestId,
      );
    },

    async rejectRequest(approvalRequestId: string) {
      return resolveRejectedRequest(
        {
          workspaceRoot: input.config.workspaceRoot,
          approvals,
          getRun: (runId) => input.stores.runStore.get(runId),
          getTask: async (taskId) => {
            const task = await input.stores.taskStore.get(taskId);
            return task ? ensureControlTask(task) : undefined;
          },
          listPendingApprovals: (threadId) => input.stores.approvalStore.listPendingByThread(threadId),
          saveTaskStatus: (task, status) => saveTaskStatus(input.stores, task, status),
          updateRunStatus,
          executeApprovedTool: (request) => toolRegistry.executeApproved(request),
          hasSuspension: async (runId) =>
            (await input.stores.runStateStore.loadActiveSuspensionByRun(runId)) !== undefined,
          buildCurrentResult: ({ threadId: targetThreadId, run, resumeDisposition, fallbackTaskSummary }) =>
            buildCurrentControlPlaneResult({
              threadId: targetThreadId,
              run,
              resumeDisposition,
              fallbackTaskSummary,
            }),
          startRootTask: (threadId, resumeInput) => controlPlane.startRootTask(threadId, resumeInput),
        },
        approvalRequestId,
      );
    },

    async restartRun(threadId: string) {
      const { run, task } = await resolveBlockedRecoveryRun(threadId);
      await cancelPendingApprovalsForRun(threadId, run.runId);
      await input.stores.runStateStore.invalidateRunRecoveryArtifacts({
        runId: run.runId,
        reason: "restart_run replaced this recovery chain",
      });
      await input.stores.runStateStore.deleteActiveRunState(run.runId);
      await saveTaskStatus(input.stores, task, "cancelled");
      await updateRunStatus(run, "interrupted", {
        activeTaskId: task.taskId,
        blockingReason: undefined,
        endedAt: new Date().toISOString(),
        resultSummary: "Manual recovery resolved by restart_run",
      });

      return controlPlane.startRootTask(threadId, run.inputText ?? task.summary);
    },

    async abandonRun(threadId: string) {
      const { run, task } = await resolveBlockedRecoveryRun(threadId);
      await cancelPendingApprovalsForRun(threadId, run.runId);
      await input.stores.runStateStore.invalidateRunRecoveryArtifacts({
        runId: run.runId,
        reason: "abandon_run replaced this recovery chain",
      });
      await input.stores.runStateStore.deleteActiveRunState(run.runId);
      const cancelledTask = await saveTaskStatus(input.stores, task, "cancelled");
      const interruptedRun = await updateRunStatus(run, "interrupted", {
        activeTaskId: cancelledTask.taskId,
        blockingReason: undefined,
        endedAt: new Date().toISOString(),
        resultSummary: "Manual recovery resolved by abandon_run",
      });

      return buildCurrentControlPlaneResult({
        threadId,
        run: interruptedRun,
        fallbackTaskSummary: cancelledTask.summary,
      });
    },

    async cancelThread(threadId: string) {
      return cancelActiveThread(threadId);
    },
    attachKernelEventPublisher(publisher) {
      kernelEventPublisher = publisher;
    },
  };
  return controlPlane;
}

export async function createAppContext(input: {
  workspaceRoot: string;
  dataDir: string;
  projectId?: string;
  modelGateway?: ModelGateway;
}) {
  // 单个 runtime scope 的装配根。推荐阅读顺序：
  // config -> sqlite stores -> recovery -> model gateway -> control plane -> kernel。
  const config = resolveConfig({
    ...input,
    allowMissingModel: true,
  });
  const { sqlite, stores } = await createAppPersistenceLayer({
    config,
    openSqlite: createSqlite,
    migrate: migrateSqlite,
    createStores,
    recoverUncertainExecutions,
  });
  await invalidateLegacyCheckpointThreads(sqlite as Database, stores, {
    workspaceRoot: config.workspaceRoot,
    projectId: config.projectId,
  });
  await stores.runStateStore.deleteExpiredAuditRecords(calculateRunStateAuditCutoff());
  const modelGateway = resolveAppModelGateway({
    config,
    modelGateway: input.modelGateway,
  });
  const {
    narrativeService,
    scratchPolicy,
    memoryConsolidator,
    controlPlane,
    agentRunManager,
    kernel,
  } = await createAppServiceLayer({
    config,
    stores,
    modelGateway,
    createNarrativeService: (currentStores) =>
      createThreadNarrativeService({
        threadStore: currentStores.threadStore,
      }),
    createScratchPolicy: createAgentRunScratchPolicy,
    createMemoryConsolidator: (currentStores, currentModelGateway) =>
      new MemoryConsolidator(currentStores.memoryStore, currentModelGateway),
    createControlPlane,
    createAgentRunManager: (currentStores) =>
      createAgentRunManager({
        runtimeFactory: createPassiveAgentRunRuntimeFactory(),
        agentRunStore: currentStores.agentRunStore,
      }),
    // kernel 是 runtime service 和 TUI 使用的稳定命令边界。
    // 它把更重的 control-plane 细节藏在简洁命令之后。
    createKernel: ({ stores: currentStores, controlPlane: currentControlPlane, narrativeService: currentNarrativeService, workspaceRoot, projectId }) =>
      createSessionKernel({
        stores: currentStores,
        controlPlane: currentControlPlane,
        narrativeService: currentNarrativeService,
        workspaceRoot,
        projectId,
      }),
  });

  bridgeModelGatewayEvents(modelGateway, kernel);

  async function close() {
    await closeAppContextResources({
      stores,
      sqlite,
    });
  }

  return {
    config,
    stores,
    controlPlane,
    kernel,
    narrativeService,
    scratchPolicy,
    memoryConsolidator,
    modelGateway,
    agentRunManager,
    close,
  };
}
