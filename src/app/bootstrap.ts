import { INTERRUPT, isInterrupted, Command, interrupt } from "@langchain/langgraph";
import { resolve } from "node:path";
import { createApprovalService, type ApprovalService, type CreateApprovalInput } from "../control/policy/approval-service";
import { createPolicyEngine } from "../control/policy/policy-engine";
import { createTaskManager } from "../control/tasks/task-manager";
import type { ControlTask } from "../control/tasks/task-types";
import { createToolRegistry } from "../control/tools/tool-registry";
import type { ToolExecuteRequest } from "../control/tools/tool-types";
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
import { createModelGateway, ModelGatewayError, type ModelGateway } from "../infra/model-gateway";
import { resolveConfig } from "../shared/config";
import { createThreadNarrativeService } from "../control/context/thread-narrative-service";
import { createWorkerScratchPolicy } from "../control/context/worker-scratch-policy";
import { MemoryConsolidator } from "../control/context/memory-consolidator";
import { transitionThread } from "../domain/thread";
import { createEvent } from "../domain/event";
import { compactThreadView } from "../control/context/thread-compaction-policy";
import type { ResumeControl } from "../runtime/graph/root/resume-control";
import { createRun, transitionRun, type Run } from "../domain/run";
import { prefixedUuid } from "../shared/id-generators";
import { buildExecutionInput, buildVerifierPrompt } from "./worker-inputs";

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

import { createThreadStateProjector } from "../control/context/thread-state-projector";

async function saveTaskStatus(stores: AppStores, task: ControlTask, status: ControlTask["status"]): Promise<ControlTask> {
  const next = { ...task, status };
  await stores.taskStore.save(next);

  // Update thread view via projector
  const thread = await stores.threadStore.get(task.threadId);
  if (thread) {
    const projector = createThreadStateProjector();
    const nextView = projector.project(
      {
        recoveryFacts: thread.recoveryFacts,
        narrativeState: thread.narrativeState,
        workingSetWindow: thread.workingSetWindow,
      },
      { kind: "task", task: next }
    );

    // Apply boundary compaction when a task blocks or completes
    const shouldCompact = status === "blocked" || status === "completed" || status === "cancelled" || status === "failed";
    const compactedView = shouldCompact 
      ? compactThreadView(nextView, { trigger: "boundary" })
      : nextView;

    await stores.threadStore.save({
      ...thread,
      recoveryFacts: compactedView.recoveryFacts,
      narrativeState: compactedView.narrativeState,
      workingSetWindow: compactedView.workingSetWindow,
    });
  }

  return next;
}

function ensureControlTask(task: {
  taskId: string;
  threadId: string;
  runId?: string;
  summary?: string;
  status: ControlTask["status"];
}): ControlTask {
  return {
    taskId: task.taskId,
    threadId: task.threadId,
    runId: task.runId ?? task.taskId,
    summary: task.summary ?? task.taskId,
    status: task.status,
  };
}

function summarizeApprovedAction(summary: string, workspaceRoot: string, requestPath?: string): string {
  if (!requestPath) {
    return summary;
  }

  const relativePath = requestPath.startsWith(workspaceRoot)
    ? requestPath.slice(workspaceRoot.length).replace(/^\/+/, "")
    : requestPath;

  if (summary.includes("delete_file")) {
    return `Deleted ${relativePath}`;
  }

  return summary;
}

function resolveApprovalToolRequest(
  approval: Awaited<ReturnType<ApprovalService["get"]>>,
  workspaceRoot: string,
): ToolExecuteRequest | undefined {
  if (!approval) {
    return undefined;
  }

  if (approval.toolRequest?.toolName) {
    return {
      toolCallId: approval.toolRequest.toolCallId,
      threadId: approval.toolRequest.threadId,
      runId: approval.toolRequest.runId,
      taskId: approval.toolRequest.taskId,
      toolName: approval.toolRequest.toolName,
      args: approval.toolRequest.args,
      path: approval.toolRequest.path,
      action: approval.toolRequest.action as ToolExecuteRequest["action"],
      changedFiles: approval.toolRequest.changedFiles,
    };
  }

  const legacyDeleteMatch = approval.summary.match(/^apply_patch delete_file (.+)$/);
  if (!legacyDeleteMatch) {
    return undefined;
  }

  const relativePath = legacyDeleteMatch[1]?.trim();
  if (!relativePath) {
    return undefined;
  }

  return {
    toolCallId: approval.toolCallId,
    threadId: approval.threadId,
    runId: approval.runId,
    taskId: approval.taskId,
    toolName: "apply_patch",
    args: {},
    action: "delete_file",
    path: resolve(workspaceRoot, relativePath),
    changedFiles: 1,
  };
}

function formatPromptSection(title: string, lines: string[]): string {
  if (lines.length === 0) {
    return "";
  }

  return `${title}:\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

function buildResponderPrompt(input: {
  text: string;
  threadView?: Awaited<ReturnType<AppStores["threadStore"]["get"]>>;
}): string {
  const sections = [`Current user request: ${input.text}`];
  const threadSummary = input.threadView?.narrativeState?.threadSummary?.trim();
  if (threadSummary) {
    sections.push(`Thread summary:\n${threadSummary}`);
  }

  const taskSummaries = input.threadView?.narrativeState?.taskSummaries?.filter(Boolean) ?? [];
  const notableEvents = input.threadView?.narrativeState?.notableEvents?.filter(Boolean) ?? [];
  const workingMessages = input.threadView?.workingSetWindow?.messages?.filter(Boolean) ?? [];
  const retrievedMemories = input.threadView?.workingSetWindow?.retrievedMemories?.filter(Boolean) ?? [];
  const latestAnswer = input.threadView?.recoveryFacts?.latestDurableAnswer?.summary?.trim();

  const narrativeSection = formatPromptSection("Recent task summaries", taskSummaries);
  if (narrativeSection) {
    sections.push(narrativeSection);
  }

  const notableSection = formatPromptSection("Notable events", notableEvents);
  if (notableSection) {
    sections.push(notableSection);
  }

  const workingSection = formatPromptSection("Recent working messages", workingMessages);
  if (workingSection) {
    sections.push(workingSection);
  }

  const memorySection = formatPromptSection("Retrieved memories", retrievedMemories);
  if (memorySection) {
    sections.push(memorySection);
  }

  if (latestAnswer) {
    sections.push(`Latest durable answer:\n- ${latestAnswer}`);
  }

  return sections.join("\n\n");
}

function isCancelledError(error: unknown): boolean {
  return error instanceof ModelGatewayError && error.kind === "cancelled_error";
}

async function createControlPlane(input: {
  config: ReturnType<typeof resolveConfig>;
  stores: AppStores;
  checkpointer: ReturnType<typeof createSqliteCheckpointer>;
  modelGateway: ModelGateway;
}): Promise<ControlPlane> {
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
      
      return {
        summary: result.summary,
        mode: "plan",
        plannerResult: result.plannerResult,
        workPackages: result.plannerResult?.workPackages ?? [],
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
    executor: async ({ input: text, threadId, taskId, currentWorkPackage, plannerResult, artifacts }) => {
      const executionInput = buildExecutionInput({
        input: text,
        currentWorkPackage,
        artifacts,
        plannerResult,
      });
      const deleteRequest = parseDeleteRequest(executionInput, input.config.workspaceRoot);
      if (!deleteRequest || !threadId || !taskId) {
        return {
          summary: `Executed request: ${executionInput}`,
          mode: "execute",
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
        interrupt({
          kind: "approval-required",
          mode: "execute",
          summary,
          approvalRequest: outcome.approvalRequest,
        });
        return {
          summary,
          mode: "execute",
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

  return {
    async startRootTask(threadId: string, inputValue: string | ResumeControl) {
      const thread = await input.stores.threadStore.get(threadId);
      if (!thread) {
        throw new Error(`thread ${threadId} not found`);
      }
      const latestRun = await input.stores.runStore.getLatestByThread(threadId);
      const isResume = latestRun?.status === "waiting_approval" || latestRun?.status === "interrupted";
      
      let task: ControlTask;
      let run: Run;
      let graphResult:
        | Awaited<ReturnType<typeof rootGraph.invoke>>
        | undefined;

      if (isResume) {
        if (!latestRun) {
          throw new Error(`no run found for thread ${threadId} to resume`);
        }
        run = await updateRunStatus(latestRun, "running");
        const tasks = await input.stores.taskStore.listByThread(threadId);
        const lastTask = tasks[tasks.length - 1];
        if (!lastTask) {
          throw new Error(`no tasks found for thread ${threadId} to resume`);
        }
        task = ensureControlTask(lastTask);
        task = await saveTaskStatus(input.stores, task, "running");
      } else {
        const text = typeof inputValue === "string" ? inputValue : inputValue.reason ?? "";
        run = await saveRun(
          createRun({
            runId: prefixedUuid("run"),
            threadId,
            trigger: "user_input",
            inputText: text,
          }),
        );
        run = await updateRunStatus(run, "running");
        task = await taskManager.createRootTask(threadId, text, run.runId);
        task = await saveTaskStatus(input.stores, task, "running");
      }
      run = await saveRun({
        ...run,
        activeTaskId: task.taskId,
      });
      const controller = new AbortController();
      activeExecutions.set(threadId, { taskId: task.taskId, controller });

      try {
        graphResult = isResume
          ? await rootGraph.invoke(
              new Command({ resume: inputValue }),
              {
                configurable: {
                  thread_id: threadId,
                  task_id: task.taskId,
                  signal: controller.signal,
                },
              },
            )
          : await rootGraph.invoke(
              { input: typeof inputValue === "string" ? inputValue : inputValue.reason ?? "" },
              {
                configurable: {
                  thread_id: threadId,
                  task_id: task.taskId,
                  signal: controller.signal,
                },
              },
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
      const approvalsForThread = await input.stores.approvalStore.listPendingByThread(threadId);
      
      let status: "waiting_approval" | "completed" = "completed";
      if (approvalsForThread.length > 0) {
        status = "waiting_approval";
      } else if (isInterrupted(graphResult)) {
        status = "waiting_approval";
      } else if ((graphResult as { mode?: string }).mode === "waiting_approval") {
        status = "waiting_approval";
      }

      const finalTask = await saveTaskStatus(input.stores, task, status === "waiting_approval" ? "blocked" : "completed");
      const interruptValue = isInterrupted(graphResult)
        ? (graphResult[INTERRUPT][0]?.value as { summary?: string } | undefined)
        : undefined;
      const recommendationReason =
        status === "waiting_approval" && approvalsForThread.length === 0
          ? (graphResult as { recommendationReason?: string }).recommendationReason
          : undefined;
      const summary = isInterrupted(graphResult)
        ? String(interruptValue?.summary ?? (typeof inputValue === "string" ? inputValue : inputValue.reason ?? ""))
        : String(
            (graphResult as { summary?: string; recommendationReason?: string }).summary ??
            recommendationReason ??
            (typeof inputValue === "string" ? inputValue : inputValue.reason ?? ""),
          );
      await updateRunStatus(run, status === "waiting_approval" ? "waiting_approval" : "completed", {
        activeTaskId: finalTask.taskId,
        resultSummary: summary,
        blockingReason:
          status === "waiting_approval"
            ? {
                kind: approvalsForThread.length > 0 ? "waiting_approval" : "human_recovery",
                message: String(interruptValue?.summary ?? recommendationReason ?? "Execution paused."),
              }
            : undefined,
        endedAt: status === "waiting_approval" ? undefined : new Date().toISOString(),
      });

      return {
        status,
        task: finalTask,
        approvals: approvalsForThread,
        summary,
        recommendationReason,
      };
    },

    async approveRequest(approvalRequestId: string) {
      const approval = await approvals.get(approvalRequestId);
      if (!approval) {
        throw new Error(`approval request ${approvalRequestId} not found`);
      }
      const run = await input.stores.runStore.get(approval.runId);
      if (!run) {
        throw new Error(`run ${approval.runId} not found for approval ${approvalRequestId}`);
      }
      const toolRequest = resolveApprovalToolRequest(approval, input.config.workspaceRoot);
      if (!toolRequest) {
        throw new Error(`approval request ${approvalRequestId} cannot be resumed without a stored tool request`);
      }

      const currentTask =
        (await input.stores.taskStore.get(approval.taskId)) ??
        ({
          taskId: approval.taskId,
          threadId: approval.threadId,
          runId: approval.runId,
          summary: approval.summary,
          status: "blocked",
        } satisfies ControlTask);
      const runningTask = await saveTaskStatus(input.stores, ensureControlTask(currentTask), "running");
      await updateRunStatus(run, "running", {
        activeTaskId: runningTask.taskId,
        blockingReason: undefined,
        endedAt: undefined,
      });
      const outcome = await toolRegistry.executeApproved(toolRequest);
      await approvals.updateStatus(approvalRequestId, "approved");
      const pendingApprovals = await input.stores.approvalStore.listPendingByThread(approval.threadId);

      if (outcome.kind === "executed") {
        const completedTask = await saveTaskStatus(input.stores, runningTask, "completed");
        await updateRunStatus(run, pendingApprovals.length > 0 ? "waiting_approval" : "completed", {
          activeTaskId: completedTask.taskId,
          resultSummary: summarizeApprovedAction(approval.summary, input.config.workspaceRoot, toolRequest.path),
          blockingReason:
            pendingApprovals.length > 0
              ? {
                  kind: "waiting_approval",
                  message: "Additional approvals are still pending.",
                }
              : undefined,
          endedAt: pendingApprovals.length > 0 ? undefined : new Date().toISOString(),
        });
        return {
          status: pendingApprovals.length > 0 ? "waiting_approval" : "completed",
          task: completedTask,
          approvals: pendingApprovals,
          summary: summarizeApprovedAction(approval.summary, input.config.workspaceRoot, toolRequest.path),
        };
      }

      const failedTask = await saveTaskStatus(input.stores, runningTask, "failed");
      await updateRunStatus(run, "failed", {
        activeTaskId: failedTask.taskId,
        resultSummary: `Unable to complete approved action: ${outcome.reason}`,
      });
      return {
        status: pendingApprovals.length > 0 ? "waiting_approval" : "completed",
        task: failedTask,
        approvals: pendingApprovals,
        summary: `Unable to complete approved action: ${outcome.reason}`,
      };
    },

    async rejectRequest(approvalRequestId: string) {
      const approval = await approvals.get(approvalRequestId);
      if (!approval) {
      throw new Error(`approval request ${approvalRequestId} not found`);
      }
      const run = await input.stores.runStore.get(approval.runId);
      if (!run) {
        throw new Error(`run ${approval.runId} not found for approval ${approvalRequestId}`);
      }

      await approvals.updateStatus(approvalRequestId, "rejected");
      const currentTask =
        (await input.stores.taskStore.get(approval.taskId)) ??
        ({
          taskId: approval.taskId,
          threadId: approval.threadId,
          runId: approval.runId,
          summary: approval.summary,
          status: "blocked",
        } satisfies ControlTask);
      const cancelledTask = await saveTaskStatus(input.stores, ensureControlTask(currentTask), "cancelled");
      const pendingApprovals = await input.stores.approvalStore.listPendingByThread(approval.threadId);
      await updateRunStatus(run, pendingApprovals.length > 0 ? "waiting_approval" : "completed", {
        activeTaskId: cancelledTask.taskId,
        resultSummary: `Rejected ${approval.summary}`,
        blockingReason:
          pendingApprovals.length > 0
            ? {
                kind: "waiting_approval",
                message: "Additional approvals are still pending.",
              }
            : undefined,
        endedAt: pendingApprovals.length > 0 ? undefined : new Date().toISOString(),
      });

      return {
        status: pendingApprovals.length > 0 ? "waiting_approval" : "completed",
        task: cancelledTask,
        approvals: pendingApprovals,
        summary: `Rejected ${approval.summary}`,
      };
    },

    async cancelThread(threadId: string) {
      return cancelActiveThread(threadId);
    },
  };
}

export async function createAppContext(input: {
  workspaceRoot: string;
  dataDir: string;
  projectId?: string;
  modelGateway?: ModelGateway;
}) {
  const config = resolveConfig(input);
  const sqlite = createSqlite(config.dataDir);
  migrateSqlite(sqlite);

  const stores = createStores(sqlite);
  await recoverUncertainExecutions(stores, {
    workspaceRoot: config.workspaceRoot,
    projectId: config.projectId,
  });
  const checkpointer = createSqliteCheckpointer(config.checkpointConnString);
  const modelGateway =
    input.modelGateway ??
    createModelGateway({
      apiKey: config.model.apiKey,
      baseURL: config.model.baseURL,
      modelName: config.model.name,
    });

  const narrativeService = createThreadNarrativeService({
    threadStore: stores.threadStore,
  });
  const scratchPolicy = createWorkerScratchPolicy();
  const memoryConsolidator = new MemoryConsolidator(stores.memoryStore, modelGateway);

  const controlPlane = await createControlPlane({ config, stores, checkpointer, modelGateway });
  const kernel = createSessionKernel({
    stores,
    controlPlane,
    narrativeService,
    workspaceRoot: config.workspaceRoot,
    projectId: config.projectId,
  });

  modelGateway.onStatusChange((status) => {
    kernel.events.publish({
      type: "model.status",
      payload: { status },
    });
  });

  modelGateway.onEvent((event) => {
    kernel.events.publish(event);
  });

  return { config, stores, controlPlane, kernel, narrativeService, scratchPolicy, memoryConsolidator, modelGateway };
  }
