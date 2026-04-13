import { Command, interrupt } from "@langchain/langgraph";
import { resolve } from "node:path";
import { createApprovalService, type ApprovalService, type CreateApprovalInput } from "../control/policy/approval-service";
import { createPolicyEngine } from "../control/policy/policy-engine";
import { createTaskManager } from "../control/tasks/task-manager";
import type { ControlTask } from "../control/tasks/task-types";
import { createToolRegistry } from "../control/tools/tool-registry";
import { createSessionKernel, type SessionControlPlaneResult } from "../kernel/session-kernel";
import { createSqliteCheckpointer } from "../persistence/sqlite/sqlite-checkpointer";
import { createSqlite } from "../persistence/sqlite/sqlite-client";
import { migrateSqlite } from "../persistence/sqlite/sqlite-migrator";
import { SqliteApprovalStore } from "../persistence/sqlite/sqlite-approval-store";
import { SqliteEventLog } from "../persistence/sqlite/sqlite-event-log";
import { SqliteMemoryStore } from "../persistence/sqlite/sqlite-memory-store";
import { SqliteRunStore } from "../persistence/sqlite/sqlite-run-store";
import { SqliteTaskStore } from "../persistence/sqlite/sqlite-task-store";
import { SqliteThreadStore } from "../persistence/sqlite/sqlite-thread-store";
import { SqliteExecutionLedger } from "../persistence/sqlite/sqlite-execution-ledger";
import { SqliteWorkerStore } from "../persistence/sqlite/sqlite-worker-store";
import { createRootGraph } from "../runtime/graph/root/graph";
import { createModelGateway, type ModelGateway } from "../infra/model-gateway";
import { resolveConfig } from "../shared/config";
import { createThreadNarrativeService } from "../control/context/thread-narrative-service";
import { createWorkerScratchPolicy } from "../control/context/worker-scratch-policy";
import { createWorkerManager } from "../control/workers/worker-manager";
import { createPassiveWorkerRuntimeFactory } from "../control/workers/worker-runtime";
import { MemoryConsolidator } from "../control/context/memory-consolidator";
import { transitionThread } from "../domain/thread";
import { createEvent } from "../domain/event";
import { compactThreadView } from "../control/context/thread-compaction-policy";
import type { ResumeControl } from "../runtime/graph/root/resume-control";
import { createRun, transitionRun, type Run } from "../domain/run";
import { prefixedUuid } from "../shared/id-generators";
import { normalizePlannerOutput } from "../runtime/planning/planner-normalization";
import {
  buildApprovedExecutionArtifacts,
  buildExecutionArtifacts,
  buildExecutionInput,
  buildVerifierPrompt,
} from "./worker-inputs";
import {
  buildResponderPrompt,
  canResetThreadCheckpoint,
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
import { invokeRootGraph } from "./control-plane-graph-bridge";
import {
  bridgeModelGatewayEvents,
  closeAppContextResources,
  createAppPersistenceLayer,
  createAppServiceLayer,
  resolveAppModelGateway,
} from "./app-context-assembly";

type AppStores = ReturnType<typeof createStores>;

type ControlPlane = {
  startRootTask(threadId: string, input: string | ResumeControl): Promise<SessionControlPlaneResult>;
  approveRequest(approvalRequestId: string): Promise<SessionControlPlaneResult>;
  rejectRequest(approvalRequestId: string): Promise<SessionControlPlaneResult>;
  cancelThread(threadId: string, reason?: string): Promise<boolean>;
};

function createStores(path: string | ReturnType<typeof createSqlite>) {
  return {
    threadStore: new SqliteThreadStore(path),
    runStore: new SqliteRunStore(path),
    taskStore: new SqliteTaskStore(path),
    approvalStore: new SqliteApprovalStore(path),
    eventLog: new SqliteEventLog(path),
    memoryStore: new SqliteMemoryStore(path),
    executionLedger: new SqliteExecutionLedger(path),
    workerStore: new SqliteWorkerStore(path),
  };
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

async function createControlPlane(input: {
  config: ReturnType<typeof resolveConfig>;
  stores: AppStores;
  checkpointer: ReturnType<typeof createSqliteCheckpointer>;
  modelGateway: ModelGateway;
}): Promise<ControlPlane> {
  // control-plane 边界：approval、tool policy、task 生命周期、run 状态和
  // LangGraph 执行都在这里汇合，然后才会被投影到 UI。
  const taskManager = createTaskManager({
    taskStore: input.stores.taskStore,
    eventLog: input.stores.eventLog,
  });
  const approvals = createPersistentApprovalService(input.stores);
  const toolRegistry = createToolRegistry({
    policy: createPolicyEngine({ workspaceRoot: input.config.workspaceRoot }),
    approvals,
    executionLedger: input.stores.executionLedger,
  });
  const activeExecutions = new Map<string, { taskId: string; controller: AbortController }>();
  const getAbortSignal = (threadId?: string) => (threadId ? activeExecutions.get(threadId)?.controller.signal : undefined);

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

  async function cancelActiveThread(threadId: string): Promise<boolean> {
    const execution = activeExecutions.get(threadId);
    const activeRun = await input.stores.runStore.getLatestByThread(threadId);
    if (!execution) {
      if (
        activeRun &&
        ["created", "running", "waiting_approval", "blocked"].includes(activeRun.status)
      ) {
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
    if (existingTask && existingTask.status === "running") {
      await saveTaskStatus(input.stores, ensureControlTask(existingTask), "cancelled");
    }

    if (activeRun && activeRun.status !== "interrupted") {
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

  const rootGraph = await createRootGraph({
    checkpointer: input.checkpointer,
    compactionPolicy: { compact: compactThreadView },
    getThreadView: async (threadId: string) => input.stores.threadStore.get(threadId),
    planner: async ({ input: text, threadId, taskId }) => {
      // Retrieve project memory for context
      const memories = await input.stores.memoryStore.search("project", { limit: 5 });
      const memoryContext = memories.length > 0 
        ? `\nProject Memory:\n${memories.map(m => `- ${m.value}`).join("\n")}\n`
        : "";
      
      const prompt = `${memoryContext}\nUser request: ${text}`;
      const result = await input.modelGateway.plan({ prompt, threadId, taskId, signal: getAbortSignal(threadId) });
      const normalized = normalizePlannerOutput({
        inputText: text,
        summary: result.summary,
        plannerResult: result.plannerResult,
      });
      
      return {
        summary: normalized.summary,
        mode: "plan",
        plannerResult: normalized.plannerResult,
        workPackages: normalized.plannerResult.workPackages,
      };
    },
    verifier: async ({ input: text, threadId, taskId, currentWorkPackage, artifacts, plannerResult }) => {
      const prompt = buildVerifierPrompt({
        input: text,
        currentWorkPackage,
        artifacts,
        plannerResult,
      });
      const result = await input.modelGateway.verify({ prompt, threadId, taskId, signal: getAbortSignal(threadId) });
      return {
        summary: result.summary,
        mode: "verify",
        isValid: result.isValid,
        feedback: result.summary, // Assuming summary contains feedback when invalid
      };
    },
    executor: async ({
      input: text,
      threadId,
      taskId,
      currentWorkPackage,
      plannerResult,
      artifacts,
      approvedApprovalRequestId,
      configurable,
    }) => {
      const executionInput = buildExecutionInput({
        input: text,
        currentWorkPackage,
        artifacts,
        plannerResult,
      });
      const resumedApprovalRequestId =
        typeof configurable?.approval_request_id === "string"
        && configurable.approval_request_id !== approvedApprovalRequestId
          ? configurable.approval_request_id
          : undefined;
      if (resumedApprovalRequestId) {
        const approval = await approvals.get(resumedApprovalRequestId);
        const approvedToolRequest = resolveApprovalToolRequest(approval, input.config.workspaceRoot);
        if (approvedToolRequest && threadId && taskId) {
          const approvedOutcome = await toolRegistry.executeApproved(approvedToolRequest);
          if (approvedOutcome.kind !== "executed") {
            return {
              summary: `Unable to complete approved action: ${approvedOutcome.reason}`,
              mode: "execute",
              approvedApprovalRequestId: resumedApprovalRequestId,
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
            summary: approvedSummary,
            mode: "execute",
            approvedApprovalRequestId: resumedApprovalRequestId,
            latestArtifacts: buildApprovedExecutionArtifacts({
              workspaceRoot: input.config.workspaceRoot,
              toolRequest: approvedToolRequest,
              summary: approvedSummary,
              currentWorkPackage,
            }),
            lastCompletedToolCallId: approvedToolRequest.toolCallId,
            lastCompletedToolName: approvedToolRequest.toolName,
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
          summary,
          mode: "execute",
          approvedApprovalRequestId,
          latestArtifacts: buildExecutionArtifacts({
            summary: useLegacyObjectiveFallback ? `${summary} (legacy objective fallback)` : summary,
            currentWorkPackage,
          }),
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
        const resolution = interrupt<{
          kind: "approval-required";
          mode: "execute";
          summary: string;
          approvalRequest: typeof outcome.approvalRequest;
        }, string | ResumeControl>({
          kind: "approval-required",
          mode: "execute",
          summary,
          approvalRequest: outcome.approvalRequest,
        });

        if (
          typeof resolution !== "string"
          && resolution.kind === "approval_resolution"
          && resolution.decision === "approved"
          && resolution.approvalRequestId
        ) {
          const approval = await approvals.get(resolution.approvalRequestId);
          const approvedToolRequest = resolveApprovalToolRequest(approval, input.config.workspaceRoot);
          if (!approvedToolRequest) {
              return {
                summary,
                mode: "execute",
                approvedApprovalRequestId,
              };
            }

          const approvedOutcome = await toolRegistry.executeApproved(approvedToolRequest);
          if (approvedOutcome.kind !== "executed") {
              return {
                summary: `Unable to complete approved action: ${approvedOutcome.reason}`,
                mode: "execute",
                approvedApprovalRequestId,
              };
            }

          const approvedSummary = summarizeApprovedAction(
            approval?.summary ?? summary,
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
              summary: approvedSummary,
              mode: "execute",
              approvedApprovalRequestId,
              latestArtifacts: buildApprovedExecutionArtifacts({
                workspaceRoot: input.config.workspaceRoot,
                toolRequest: approvedToolRequest,
              summary: approvedSummary,
              currentWorkPackage,
            }),
            lastCompletedToolCallId: approvedToolRequest.toolCallId,
            lastCompletedToolName: approvedToolRequest.toolName,
          };
        }
        return {
          summary,
          mode: "execute",
          approvedApprovalRequestId,
          pendingToolCallId: `${taskId}:apply_patch`,
          pendingToolName: "apply_patch",
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
          summary,
          mode: "execute",
          approvedApprovalRequestId,
          latestArtifacts: buildExecutionArtifacts({
            summary,
            currentWorkPackage,
            changedPath: deleteRequest.relativePath,
          }),
          lastCompletedToolCallId: `${taskId}:apply_patch`,
          lastCompletedToolName: "apply_patch",
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
        summary: errorSummary,
        mode: "execute",
        approvedApprovalRequestId,
      };
    },
    responder: async ({ input: text, threadId, taskId }) => {
      const threadView = threadId ? await input.stores.threadStore.get(threadId) : undefined;
      const prompt = buildResponderPrompt({ text, threadView });
      const result = await input.modelGateway.respond({
        prompt,
        threadId,
        taskId,
        signal: getAbortSignal(threadId),
      });
      return {
        summary: result.summary,
        mode: "respond",
      };
    },
  });

  const controlPlane: ControlPlane = {
    async startRootTask(threadId: string, inputValue: string | ResumeControl) {
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
      let graphResult:
        | Awaited<ReturnType<typeof rootGraph.invoke>>
        | undefined;
      const controller = new AbortController();
      activeExecutions.set(threadId, { taskId: task.taskId, controller });

      try {
        graphResult = await invokeRootGraph(
          {
            invokeResume: (resumeControl) =>
              rootGraph.invoke(new Command({ resume: resumeControl }), {
                configurable: {
                  thread_id: threadId,
                  task_id: task.taskId,
                  approval_request_id:
                    resumeControl.kind === "approval_resolution" && resumeControl.decision === "approved"
                      ? resumeControl.approvalRequestId
                      : undefined,
                  signal: controller.signal,
                },
              }),
            invokeFresh: (text) =>
              rootGraph.invoke(
                { input: text },
                {
                  configurable: {
                    thread_id: threadId,
                    task_id: task.taskId,
                    signal: controller.signal,
                  },
                },
              ),
          },
          { inputValue, isResume },
        );
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

      return finalizeRootTaskExecution(
        {
          listPendingApprovals: (targetThreadId) => input.stores.approvalStore.listPendingByThread(targetThreadId),
          saveTaskStatus: (nextTask, status) => saveTaskStatus(input.stores, nextTask, status),
          updateRunStatus,
        },
        inputValue,
        threadId,
        run,
        task,
        graphResult,
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
          getCheckpoint: (threadId) =>
            input.checkpointer.getTuple({
              configurable: { thread_id: threadId },
            }),
          deleteCheckpoint: canResetThreadCheckpoint(input.checkpointer)
            ? (threadId) => input.checkpointer.deleteThread(threadId)
            : undefined,
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
          getCheckpoint: (threadId) =>
            input.checkpointer.getTuple({
              configurable: { thread_id: threadId },
            }),
          deleteCheckpoint: canResetThreadCheckpoint(input.checkpointer)
            ? (threadId) => input.checkpointer.deleteThread(threadId)
            : undefined,
          startRootTask: (threadId, resumeInput) => controlPlane.startRootTask(threadId, resumeInput),
        },
        approvalRequestId,
      );
    },

    async cancelThread(threadId: string) {
      return cancelActiveThread(threadId);
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
  const config = resolveConfig(input);
  const { sqlite, stores, checkpointer } = await createAppPersistenceLayer({
    config,
    openSqlite: createSqlite,
    migrate: migrateSqlite,
    createStores,
    recoverUncertainExecutions,
    createCheckpointer: createSqliteCheckpointer,
  });
  const modelGateway = resolveAppModelGateway({
    config,
    modelGateway: input.modelGateway,
  });
  const {
    narrativeService,
    scratchPolicy,
    memoryConsolidator,
    controlPlane,
    workerManager,
    kernel,
  } = await createAppServiceLayer({
    config,
    stores,
    checkpointer,
    modelGateway,
    createNarrativeService: (currentStores) =>
      createThreadNarrativeService({
        threadStore: currentStores.threadStore,
      }),
    createScratchPolicy: createWorkerScratchPolicy,
    createMemoryConsolidator: (currentStores, currentModelGateway) =>
      new MemoryConsolidator(currentStores.memoryStore, currentModelGateway),
    createControlPlane,
    createWorkerManager: (currentStores) =>
      createWorkerManager({
        runtimeFactory: createPassiveWorkerRuntimeFactory(),
        workerStore: currentStores.workerStore,
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
      checkpointer: checkpointer as { close?: () => Promise<void> },
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
    workerManager,
    close,
  };
}
