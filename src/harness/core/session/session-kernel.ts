/**
 * @module harness/core/session/session-kernel
 * harness session kernel（会话内核）。
 *
 * 这是 surface 与 harness core 之间的稳定命令边界。
 * 它把 submit / approve / reject / interrupt 这些命令
 * 投影成统一的 session 视图，协调命令分发、状态投影
 * 与事件推送。
 *
 * session kernel 是 harness spine 的核心枢纽：
 * - 接收 surface 发来的用户命令
 * - 分发到 control plane
 * - 推送 thread / task / run 相关事件
 * - 生成可消费的 session projection
 */
import type { ApprovalRequest } from "../../../domain/approval";
import { createEvent } from "../../../domain/event";
import type { Run } from "../../../domain/run";
import type { Task } from "../../../domain/task";
import type { Thread } from "../../../domain/thread";
import type { ThreadNarrativeService } from "../../../control/context/thread-narrative-service";
import type { EventLogPort } from "../../../persistence/ports/event-log-port";
import type { TaskStorePort } from "../../../persistence/ports/task-store-port";
import type { ThreadStorePort } from "../../../persistence/ports/thread-store-port";
import type { WorkerStorePort } from "../../../persistence/ports/worker-store-port";
import type { ResumeControl } from "../../../runtime/graph/root/resume-control";
import { prefixedUuid } from "../../../shared/id-generators";
import { createEventBus, type KernelEvent } from "../../../kernel/event-bus";
import { createInterruptService } from "../../../kernel/interrupt-service";
import { applySessionControlPlaneResult } from "../../../kernel/session-result-applicator";
import { runSessionInBackground } from "../../../kernel/session-background-runner";
import { createThreadService } from "../../../kernel/thread-service";
import {
  resolveApprovalCommandContext,
  resolveSubmitCommandContext,
  shouldShortCircuitBlockedSubmit,
} from "./session-command-handler";
import {
  buildStableSessionArtifacts,
  deriveProjectedExecutionStatus,
  projectSessionResult,
  type ProjectedSessionResult,
  type SessionThreadSummary,
} from "../projection/session-view-projector";

export type SubmitInputCommand = {
  type: "submit_input";
  payload: {
    text: string;
    background?: boolean;
  };
};

export type ApproveRequestCommand = {
  type: "approve_request";
  payload: {
    approvalRequestId: string;
  };
};

export type RejectRequestCommand = {
  type: "reject_request";
  payload: {
    approvalRequestId: string;
  };
};

export type SessionCommand = SubmitInputCommand | ApproveRequestCommand | RejectRequestCommand;

export type SessionControlPlaneResult = {
  status: "completed" | "waiting_approval" | "blocked";
  task: Task;
  approvals: ApprovalRequest[];
  summary: string;
  recommendationReason?: string;
  lastCompletedToolCallId?: string;
  lastCompletedToolName?: string;
  pendingToolCallId?: string;
  pendingToolName?: string;
};

export type SessionCommandResult = ProjectedSessionResult;

export type SessionKernel = {
  events: ReturnType<typeof createEventBus<KernelEvent>>;
  interrupts: ReturnType<typeof createInterruptService>;
  handleCommand: (command: SessionCommand, expectedRevision?: number) => Promise<SessionCommandResult>;
  hydrateSession: () => Promise<SessionCommandResult | undefined>;
};

export function createSessionKernel(deps: {
  stores: {
    threadStore: ThreadStorePort;
    taskStore: TaskStorePort;
    runStore: {
      getLatestByThread(threadId: string): Promise<Run | undefined>;
    };
    approvalStore: {
      listPendingByThread(threadId: string): Promise<ApprovalRequest[]>;
      get(id: string): Promise<ApprovalRequest | undefined>;
    };
    workerStore: WorkerStorePort;
    eventLog?: EventLogPort;
  };
  controlPlane: {
    startRootTask: (threadId: string, input: string | ResumeControl) => Promise<SessionControlPlaneResult>;
    approveRequest: (approvalRequestId: string) => Promise<SessionControlPlaneResult>;
    rejectRequest: (approvalRequestId: string) => Promise<SessionControlPlaneResult>;
  };
  narrativeService?: ThreadNarrativeService;
  workspaceRoot?: string;
  projectId?: string;
}): SessionKernel {
  // 面向 surface 的命令边界。kernel 负责解析 durable context、
  // 启动后台 control-plane 工作，并返回当前时刻的 session projection。
  const events = createEventBus<KernelEvent>();
  const threadService = createThreadService({
    threadStore: deps.stores.threadStore,
    events,
    workspaceRoot: deps.workspaceRoot,
    projectId: deps.projectId,
  });
  const interrupts = createInterruptService({ events });

  const currentScope = {
    workspaceRoot: deps.workspaceRoot ?? "",
    projectId: deps.projectId ?? "",
  };

  async function getThreadSummaries(): Promise<SessionThreadSummary[]> {
    const threads = await deps.stores.threadStore.listByScope(currentScope);
    return Promise.all(threads.map(async (t) => {
      const approvals = await deps.stores.approvalStore.listPendingByThread(t.threadId);
      const latestRun = await deps.stores.runStore.getLatestByThread(t.threadId);
      return {
        threadId: t.threadId,
        status: latestRun?.status ?? t.status,
        activeRunId: latestRun?.runId,
        activeRunStatus: latestRun?.status,
        narrativeSummary: t.narrativeState?.threadSummary,
        pendingApprovalCount: approvals.length,
        blockingReasonKind: t.recoveryFacts?.blocking?.kind,
      };
    }));
  }

  async function checkRevision(threadId: string, expectedRevision?: number) {
    if (expectedRevision === undefined) return;
    const thread = await deps.stores.threadStore.get(threadId);
    if (thread && thread.revision !== expectedRevision) {
      throw new Error(`stale thread revision: expected ${expectedRevision} but found ${thread.revision}`);
    }
  }

  async function appendRuntimeEvent(input: {
    threadId: string;
    taskId?: string;
    type: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    if (!deps.stores.eventLog) return;
    await deps.stores.eventLog.append(
      createEvent({
        eventId: prefixedUuid("event"),
        threadId: input.threadId,
        taskId: input.taskId,
        type: input.type,
        payload: input.payload,
      }),
    );
  }

  function publishTaskFailure(threadId: string, errorMessage: string) {
    events.publish({
      type: "task.failed",
      payload: { threadId, error: errorMessage },
    });
  }

  async function publishSessionView(threadId: string, result: SessionCommandResult): Promise<void> {
    events.publish({
      type: "thread.view_updated",
      payload: result,
    });

    await appendRuntimeEvent({
      threadId,
      type: "thread.view_updated",
      payload: result as unknown as Record<string, unknown>,
    });
  }

  function startBackgroundControlAction(input: {
    threadId: string;
    execute: () => Promise<SessionControlPlaneResult>;
  }) {
    void runSessionInBackground({
      threadId: input.threadId,
      execute: input.execute,
      finalize: async (result) => {
        await finalize(input.threadId, result);
      },
      publishFailure: publishTaskFailure,
    });
  }

  async function buildSessionResult(input: {
    thread: Thread;
    status: ProjectedSessionResult["status"];
    tasks: Task[];
    approvals: ApprovalRequest[];
    summary?: string;
    recommendationReason?: string;
    threadList?: SessionThreadSummary[];
  }): Promise<SessionCommandResult> {
    const stableArtifacts = buildStableSessionArtifacts({
      thread: input.thread,
      workers: await deps.stores.workerStore.listByThread(input.thread.threadId),
    });

    return projectSessionResult({
      thread: input.thread,
      status: input.status,
      tasks: input.tasks,
      approvals: input.approvals,
      answers: stableArtifacts.answers,
      messages: stableArtifacts.messages,
      workers: stableArtifacts.workers,
      summary: input.summary,
      recommendationReason: input.recommendationReason,
      workspaceRoot: deps.workspaceRoot,
      projectId: deps.projectId,
      threads: input.threadList,
    });
  }

  async function finalize(threadId: string, result: SessionControlPlaneResult): Promise<SessionCommandResult> {
    const thread = await deps.stores.threadStore.get(threadId);
    if (!thread) throw new Error(`missing thread ${threadId}`);
    const nextThread = await applySessionControlPlaneResult({
      thread,
      result,
      narrativeService: deps.narrativeService,
      saveThread: (next) => deps.stores.threadStore.save(next),
    });

    const threadList = await getThreadSummaries();
    const commandResult = await buildSessionResult({
      thread: nextThread,
      status: result.status,
      tasks: [result.task],
      approvals: result.approvals,
      summary: result.summary,
      recommendationReason: result.recommendationReason,
      threadList,
    });

    await publishSessionView(threadId, commandResult);
    return commandResult;
  }

  async function hydrateSession(): Promise<SessionCommandResult | undefined> {
    const thread = await deps.stores.threadStore.getLatest(currentScope);
    if (!thread) return undefined;
    const latestRun = await deps.stores.runStore.getLatestByThread(thread.threadId);

    const threadList = await getThreadSummaries();
    const tasks = await deps.stores.taskStore.listByThread(thread.threadId);
    const approvals = await deps.stores.approvalStore.listPendingByThread(thread.threadId);
    const blockedWithoutRun = !latestRun && shouldShortCircuitBlockedSubmit({ latestRun, thread, tasks });

    return buildSessionResult({
      thread,
      status: blockedWithoutRun ? "blocked" : deriveProjectedExecutionStatus(latestRun, thread.status),
      tasks,
      approvals,
      threadList,
    });
  }

  return {
    events,
    interrupts,
    hydrateSession,
    async handleCommand(command, expectedRevision) {
      // 所有命令分支都遵循同一个形状：
      // 先解析当前 thread/run/task 状态 -> 再启动后台工作 ->
      // 然后立刻返回当前最合理的投影视图。
      if (command.type === "submit_input") {
        const latestThread = await deps.stores.threadStore.getLatest(currentScope);
        const submitContext = await resolveSubmitCommandContext({
          latestThread,
          expectedRevision,
          getLatestRunByThread: (threadId) => deps.stores.runStore.getLatestByThread(threadId),
          listTasksByThread: (threadId) => deps.stores.taskStore.listByThread(threadId),
          listPendingApprovalsByThread: (threadId) => deps.stores.approvalStore.listPendingByThread(threadId),
          startThread: async () => threadService.startThread(),
          saveThread: async (nextThread) => deps.stores.threadStore.save(nextThread),
          ensureRevision: checkRevision,
        });
        const { thread } = submitContext;

        if (submitContext.blocked) {
          const threadList = await getThreadSummaries();
          return buildSessionResult({
            thread,
            status: "blocked",
            tasks: submitContext.tasks,
            approvals: submitContext.approvals,
            threadList,
          });
        }

        startBackgroundControlAction({
          threadId: thread.threadId,
          execute: () => deps.controlPlane.startRootTask(thread.threadId, command.payload.text),
        });

        const threadList = await getThreadSummaries();
        return buildSessionResult({
          thread,
          status: deriveProjectedExecutionStatus(submitContext.latestRun, thread.status),
          tasks: submitContext.tasks,
          approvals: submitContext.approvals,
          threadList,
        });
      }

      if (command.type === "approve_request") {
        const approvalContext = await resolveApprovalCommandContext({
          approvalRequestId: command.payload.approvalRequestId,
          getApproval: (approvalRequestId) => deps.stores.approvalStore.get(approvalRequestId),
          getThread: (threadId) => deps.stores.threadStore.get(threadId),
          getLatestRunByThread: (threadId) => deps.stores.runStore.getLatestByThread(threadId),
          listTasksByThread: (threadId) => deps.stores.taskStore.listByThread(threadId),
          listPendingApprovalsByThread: (threadId) => deps.stores.approvalStore.listPendingByThread(threadId),
        });

        startBackgroundControlAction({
          threadId: approvalContext.approval.threadId,
          execute: () => deps.controlPlane.approveRequest(command.payload.approvalRequestId),
        });

        const threadList = await getThreadSummaries();
        return buildSessionResult({
          thread: approvalContext.thread,
          status: deriveProjectedExecutionStatus(approvalContext.latestRun, approvalContext.thread.status),
          tasks: approvalContext.tasks,
          approvals: approvalContext.approvals,
          threadList,
        });
      }

      if (command.type === "reject_request") {
        const approvalContext = await resolveApprovalCommandContext({
          approvalRequestId: command.payload.approvalRequestId,
          getApproval: (approvalRequestId) => deps.stores.approvalStore.get(approvalRequestId),
          getThread: (threadId) => deps.stores.threadStore.get(threadId),
          getLatestRunByThread: (threadId) => deps.stores.runStore.getLatestByThread(threadId),
          listTasksByThread: (threadId) => deps.stores.taskStore.listByThread(threadId),
          listPendingApprovalsByThread: (threadId) => deps.stores.approvalStore.listPendingByThread(threadId),
        });

        startBackgroundControlAction({
          threadId: approvalContext.approval.threadId,
          execute: () => deps.controlPlane.rejectRequest(command.payload.approvalRequestId),
        });

        const threadList = await getThreadSummaries();
        return buildSessionResult({
          thread: approvalContext.thread,
          status: deriveProjectedExecutionStatus(approvalContext.latestRun, approvalContext.thread.status),
          tasks: approvalContext.tasks,
          approvals: approvalContext.approvals,
          threadList,
        });
      }

      throw new Error("no command handler registered");
    },
  };
}
