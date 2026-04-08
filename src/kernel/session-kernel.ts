import type { Run } from "../domain/run";
import type { Thread } from "../domain/thread";
import { createEventBus, type KernelEvent } from "./event-bus";
import { createInterruptService } from "./interrupt-service";
import { createThreadService } from "./thread-service";
import { createEvent } from "../domain/event";
import type { ApprovalRequest } from "../domain/approval";
import type { Task } from "../domain/task";
import { resolveSubmitTargetThread } from "./session-command-handler";
import { runSessionInBackground } from "./session-background-runner";
import { projectSessionResult, type ProjectedSessionResult, type SessionThreadSummary } from "./session-view-projector";
import type { ThreadStorePort } from "../persistence/ports/thread-store-port";
import type { TaskStorePort } from "../persistence/ports/task-store-port";
import type { EventLogPort } from "../persistence/ports/event-log-port";
import { prefixedUuid } from "../shared/id-generators";
import type { ThreadNarrativeService } from "../control/context/thread-narrative-service";
import { createThreadStateProjector } from "../control/context/thread-state-projector";
import type { DerivedThreadView } from "../control/context/thread-compaction-types";
import { createControlTask } from "../control/tasks/task-types";
import type { ResumeControl } from "../runtime/graph/root/resume-control";

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

function toProjectedExecutionStatus(
  latestRun: Run | undefined,
  fallbackStatus: ProjectedSessionResult["status"] | Thread["status"],
): ProjectedSessionResult["status"] {
  if (!latestRun) {
    return fallbackStatus === "archived" ? "completed" : fallbackStatus;
  }

  switch (latestRun.status) {
    case "created":
    case "running":
      return "active";
    case "failed":
    case "interrupted":
      return "blocked";
    default:
      return latestRun.status;
  }
}

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
  const events = createEventBus<KernelEvent>();
  const threadService = createThreadService({
    threadStore: deps.stores.threadStore,
    events,
    workspaceRoot: deps.workspaceRoot,
    projectId: deps.projectId,
  });
  const interrupts = createInterruptService({ events });
  const projector = createThreadStateProjector();

  const currentScope = { 
    workspaceRoot: deps.workspaceRoot ?? "", 
    projectId: deps.projectId ?? "" 
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
        blockingReasonKind: t.recoveryFacts?.blocking?.kind
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

  function toControlTask(task: Task) {
    return createControlTask({
      taskId: task.taskId,
      threadId: task.threadId,
      runId: task.runId,
      summary: task.summary ?? task.taskId,
      status: task.status,
      blockingReason: task.blockingReason,
    });
  }

  function hasDurableBlockingState(input: {
    thread: { recoveryFacts?: DerivedThreadView["recoveryFacts"] };
    tasks: Task[];
  }): boolean {
    if (input.thread.recoveryFacts?.blocking) {
      return true;
    }

    return input.tasks.some((task) => task.status === "blocked" && task.blockingReason);
  }

  async function finalize(threadId: string, result: SessionControlPlaneResult): Promise<SessionCommandResult> {
    const thread = await deps.stores.threadStore.get(threadId);
    if (!thread) throw new Error(`missing thread ${threadId}`);

    // Project the results into the structured ThreadView (V1.4)
    let view: DerivedThreadView = {
      recoveryFacts: thread.recoveryFacts,
      narrativeState: thread.narrativeState,
      workingSetWindow: thread.workingSetWindow
    };

    if (result.task) {
      const controlTask = toControlTask(result.task);
      view = projector.project(view, { kind: "task", task: controlTask });
      if (deps.narrativeService) {
        await deps.narrativeService.processTaskUpdate(controlTask);
      }
    }
    for (const approval of result.approvals) {
      view = projector.project(view, { kind: "approval", approval });
    }
    view = projector.project(view, {
      kind: "transcript_message",
      messageId: prefixedUuid("msg"),
      role: "assistant",
      content: result.summary,
    });
    view = projector.project(view, { kind: "answer", answerId: prefixedUuid("ans"), summary: result.summary });

    // Project ledger state updates
    if (result.lastCompletedToolCallId) {
      view = projector.project(view, {
        kind: "tool_executed",
        toolCallId: result.lastCompletedToolCallId,
        toolName: result.lastCompletedToolName ?? "",
      });
    }
    if (result.pendingToolCallId) {
      view = projector.project(view, {
        kind: result.status === "waiting_approval" ? "tool_blocked" : "tool_pending",
        toolCallId: result.pendingToolCallId,
        toolName: result.pendingToolName ?? "",
      });
    }

    // Persist the updated view back to the thread
    const nextThread = {
      ...thread,
      ...view,
      status: "active" as const,
      revision: (view.recoveryFacts?.revision ?? thread.revision ?? 1),
    };
    await deps.stores.threadStore.save(nextThread);

    const threadList = await getThreadSummaries();
    // Emit the structured update event that the TUI expects
    const commandResult = await projectSessionResult({
      thread: {
        threadId,
        status: nextThread.status,
        recoveryFacts: view.recoveryFacts,
        narrativeState: view.narrativeState,
        workingSetWindow: view.workingSetWindow,
      },
      status: result.status,
      summary: result.summary,
      approvals: result.approvals,
      tasks: [result.task],
      recommendationReason: result.recommendationReason,
      workspaceRoot: deps.workspaceRoot,
      projectId: deps.projectId,
      threads: threadList,
    });

    events.publish({
      type: "thread.view_updated",
      payload: commandResult,
    });

    await appendRuntimeEvent({
      threadId,
      type: "thread.view_updated",
      payload: commandResult as unknown as Record<string, unknown>,
    });

    return commandResult;
  }

  async function hydrateSession(): Promise<SessionCommandResult | undefined> {
    const thread = await deps.stores.threadStore.getLatest(currentScope);
    if (!thread) return undefined;
    const latestRun = await deps.stores.runStore.getLatestByThread(thread.threadId);

    const threadList = await getThreadSummaries();
    const tasks = await deps.stores.taskStore.listByThread(thread.threadId);
    const approvals = await deps.stores.approvalStore.listPendingByThread(thread.threadId);
    const blockedWithoutRun = !latestRun && hasDurableBlockingState({ thread, tasks });

    return projectSessionResult({
      thread,
      status: blockedWithoutRun ? "blocked" : toProjectedExecutionStatus(latestRun, thread.status),
      tasks,
      approvals,
      workspaceRoot: deps.workspaceRoot,
      projectId: deps.projectId,
      threads: threadList,
    });
  }

  return {
    events,
    interrupts,
    hydrateSession,
    async handleCommand(command, expectedRevision) {
      if (command.type === "submit_input") {
        const latestThread = await deps.stores.threadStore.getLatest(currentScope);
        const latestRun = latestThread ? await deps.stores.runStore.getLatestByThread(latestThread.threadId) : undefined;
        const { thread } = await resolveSubmitTargetThread({
          latestThread,
          latestRun,
          expectedRevision,
          startThread: async () => threadService.startThread(),
          saveThread: async (nextThread) => deps.stores.threadStore.save(nextThread),
          ensureRevision: checkRevision,
        });

        const tasks = await deps.stores.taskStore.listByThread(thread.threadId);
        const approvals = await deps.stores.approvalStore.listPendingByThread(thread.threadId);
        const blockedWithoutRun = !latestRun && hasDurableBlockingState({ thread, tasks });

        if (latestRun?.status === "blocked" || blockedWithoutRun) {
          const threadList = await getThreadSummaries();
          return projectSessionResult({
            thread,
            status: "blocked",
            tasks,
            approvals,
            workspaceRoot: deps.workspaceRoot,
            projectId: deps.projectId,
            threads: threadList,
          });
        }

        const threadWithPrompt = {
          recoveryFacts: thread.recoveryFacts,
          narrativeState: thread.narrativeState,
          workingSetWindow: thread.workingSetWindow,
        };
        const updatedView = projector.project(threadWithPrompt, {
          kind: "transcript_message",
          messageId: prefixedUuid("msg"),
          role: "user",
          content: command.payload.text,
        });
        await deps.stores.threadStore.save({
          ...thread,
          recoveryFacts: updatedView.recoveryFacts,
          narrativeState: updatedView.narrativeState,
          workingSetWindow: updatedView.workingSetWindow,
          revision: updatedView.recoveryFacts?.revision ?? thread.revision,
        });

        void runSessionInBackground({
          threadId: thread.threadId,
          execute: () => deps.controlPlane.startRootTask(thread.threadId, command.payload.text),
          finalize: async (result) => {
            await finalize(thread.threadId, result);
          },
          publishFailure: (failedThreadId, errorMessage) => {
            events.publish({
              type: "task.failed",
              payload: { threadId: failedThreadId, error: errorMessage }
            });
          },
        });

        const threadList = await getThreadSummaries();
        return projectSessionResult({
          thread,
          status: toProjectedExecutionStatus(latestRun, thread.status),
          tasks,
          approvals,
          workspaceRoot: deps.workspaceRoot,
          projectId: deps.projectId,
          threads: threadList,
        });
      }

      if (command.type === "approve_request") {
        const approval = await deps.stores.approvalStore.get(command.payload.approvalRequestId);
        if (!approval) throw new Error(`Approval request ${command.payload.approvalRequestId} not found`);

        void runSessionInBackground({
          threadId: approval.threadId,
          execute: () => deps.controlPlane.approveRequest(command.payload.approvalRequestId),
          finalize: async (result) => {
            await finalize(approval.threadId, result);
          },
          publishFailure: (failedThreadId, errorMessage) => {
            events.publish({
              type: "task.failed",
              payload: { threadId: failedThreadId, error: errorMessage }
            });
          },
        });

        const approvalThread = await deps.stores.threadStore.get(approval.threadId);
        if (!approvalThread) {
          throw new Error(`Thread ${approval.threadId} not found for approval`);
        }
        const threadList = await getThreadSummaries();
        const tasks = await deps.stores.taskStore.listByThread(approvalThread.threadId);
        const approvals = await deps.stores.approvalStore.listPendingByThread(approvalThread.threadId);
        const latestRun = await deps.stores.runStore.getLatestByThread(approvalThread.threadId);
        return projectSessionResult({
          thread: approvalThread,
          status: toProjectedExecutionStatus(latestRun, approvalThread.status),
          tasks,
          approvals,
          workspaceRoot: deps.workspaceRoot,
          projectId: deps.projectId,
          threads: threadList,
        });
      }

      if (command.type === "reject_request") {
        const result = await deps.controlPlane.rejectRequest(command.payload.approvalRequestId);
        return finalize(result.task.threadId, result);
      }

      throw new Error("no command handler registered");
    },
  };
}
