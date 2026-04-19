import { createAppContext } from "../../../app/bootstrap";
import { createEvent } from "../../../domain/event";
import type { Run } from "../../../domain/run";
import { createThread, type Thread } from "../../../domain/thread";
import { transitionThread } from "../../../domain/thread";
import { DEFAULT_THREAD_MODE, type ThreadMode } from "../../../control/agents/thread-mode";
import type { HarnessSessionScope } from "../../server/harness-session-scope";
import type { RuntimeCommand } from "../../protocol/schemas/api-schema";
import type { SessionCommandResult } from "./session-kernel";
import type { WorkerView } from "../../protocol/views/worker-view";

type AppContext = Awaited<ReturnType<typeof createAppContext>>;

/** harness 协议命令处理器依赖：负责 scope 校验、active thread 管理和上下文访问 */
type RuntimeCommandHandlerDeps = {
  scope: HarnessSessionScope;
  context: AppContext;
  ensureActiveThread: () => Promise<Thread>;
  touchThread: (thread: Thread, nextStatus?: Thread["status"]) => Promise<Thread>;
  setActiveThreadId: (threadId: string) => void;
};

/** 作用域键——用于报错与缓存命中时的人类可读标识 */
function scopeKey(scope: HarnessSessionScope): string {
  return `${scope.workspaceRoot}::${scope.projectId}`;
}

/** 当 scope 下还没有任何 thread 时，返回一份稳定的空会话结果 */
function createEmptySessionResult(scope: HarnessSessionScope): SessionCommandResult {
  return {
    threadId: "",
    threadMode: DEFAULT_THREAD_MODE,
    status: "completed",
    finalResponse: undefined,
    executionSummary: undefined,
    verificationSummary: undefined,
    pauseSummary: undefined,
    latestExecutionStatus: "completed",
    workspaceRoot: scope.workspaceRoot,
    projectId: scope.projectId,
    approvals: [],
    tasks: [],
    threads: [],
  };
}

/** 把内部 worker 记录裁成 protocol 层允许暴露的 WorkerView */
function toWorkerView(worker: {
  workerId: string;
  threadId: string;
  taskId: string;
  role: WorkerView["role"];
  status: WorkerView["status"];
  spawnReason: string;
  startedAt?: string;
  endedAt?: string;
  resumeToken?: string;
}): WorkerView {
  return {
    workerId: worker.workerId,
    threadId: worker.threadId,
    taskId: worker.taskId,
    role: worker.role,
    status: worker.status,
    spawnReason: worker.spawnReason,
    startedAt: worker.startedAt,
    endedAt: worker.endedAt,
    resumeToken: worker.resumeToken,
  };
}

/** 只有 blocked / interrupted 的 run 才具备“继续执行”语义 */
function canResumeLatestRun(run: Run | undefined): boolean {
  return run?.status === "blocked" || run?.status === "interrupted";
}

/** 这些 run 状态允许从 TUI 发起 interrupt */
function canInterruptLatestRun(run: Run | undefined): boolean {
  return (
    run?.status === "created" ||
    run?.status === "running" ||
    run?.status === "waiting_approval" ||
    run?.status === "blocked" ||
    run?.status === "interrupted"
  );
}

export function createRuntimeCommandHandler(deps: RuntimeCommandHandlerDeps) {
  async function hydrateOrEmpty() {
    return (await deps.context.kernel.hydrateSession()) ?? createEmptySessionResult(deps.scope);
  }

  /** workerManager 是可选装配项；进入 worker 命令路径时再强校验 */
  function getWorkerManager() {
    const workerManager = deps.context.workerManager;
    if (!workerManager) {
      throw new Error("worker manager is not configured for this runtime");
    }
    return workerManager;
  }

  async function getWorkerThread(workerId: string): Promise<Thread | undefined> {
    const worker = await deps.context.stores.workerStore.get(workerId);
    if (!worker) {
      return undefined;
    }
    const thread = await deps.context.stores.threadStore.get(worker.threadId);
    if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
      return undefined;
    }
    return thread;
  }

  async function appendRuntimeEvent(input: {
    threadId: string;
    type: string;
    payload: Record<string, unknown>;
  }) {
    if (!deps.context.stores.eventLog) {
      return;
    }

    await deps.context.stores.eventLog.append({
      ...createEvent({
        eventId: `event_${crypto.randomUUID()}`,
        threadId: input.threadId,
        type: input.type,
        payload: input.payload,
        createdAt: new Date().toISOString(),
      }),
    });
  }

  async function updateThreadMode(input: {
    thread: Thread;
    nextMode: ThreadMode;
    trigger: "slash_command" | "plain_input" | "runtime_command" | "compat_plan_task";
    reason?: string;
  }) {
    const fromMode = input.thread.threadMode;
    if (fromMode === input.nextMode) {
      return input.thread;
    }

    const nextThread: Thread = {
      ...input.thread,
      threadMode: input.nextMode,
      revision: (input.thread.revision ?? 1) + 1,
    };
    await deps.context.stores.threadStore.save(nextThread);

    const payload = {
      threadId: input.thread.threadId,
      fromMode,
      toMode: input.nextMode,
      trigger: input.trigger,
      reason: input.reason,
    };
    deps.context.kernel.events.publish({
      type: "thread.mode_changed",
      payload,
    });
    await appendRuntimeEvent({
      threadId: input.thread.threadId,
      type: "thread.mode_changed",
      payload,
    });

    return nextThread;
  }

  function publishWorkerEvent(
    type: "worker.spawned" | "worker.inspected" | "worker.resumed" | "worker.cancelled" | "worker.completed" | "worker.failed",
    worker: ReturnType<typeof toWorkerView>,
  ) {
    deps.context.kernel.events.publish({
      type,
      payload: {
        worker,
      },
    });
  }

  return async function handleRuntimeCommand(command: RuntimeCommand): Promise<SessionCommandResult> {
    if (command.kind === "new_thread") {
      // 显式 new_thread 永远创建新的协作线，而不是复用现有 active thread。
      const thread = createThread(crypto.randomUUID(), deps.scope.workspaceRoot, deps.scope.projectId);
      await deps.touchThread(thread, "active");

      const result = await deps.context.kernel.hydrateSession();
      if (!result) throw new Error("failed to hydrate new thread");
      return result;
    }

    if (command.kind === "switch_thread" || command.kind === "continue") {
      const threadId = command.threadId;
      if (!threadId) {
        const result = await deps.context.kernel.hydrateSession();
        return result ?? createEmptySessionResult(deps.scope);
      }
      const thread = await deps.context.stores.threadStore.get(threadId);
      if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
        throw new Error(`thread ${threadId} not found in scope ${scopeKey(deps.scope)}`);
      }
      const latestRun = await deps.context.stores.runStore.getLatestByThread(thread.threadId);

      const nextStatus =
        command.kind === "switch_thread"
          ? "active"
          : command.kind === "continue" && (canResumeLatestRun(latestRun) || thread.status === "idle")
            ? "active"
            : undefined;
      // continue 只在 thread 可继续时把它重新激活；否则保持原状，只返回当前快照。
      await deps.touchThread(thread, nextStatus);

      const result = await deps.context.kernel.hydrateSession();
      if (!result) throw new Error("failed to hydrate thread");
      return result;
    }

    if (
      command.kind === "restart_run"
      || command.kind === "resubmit_intent"
      || command.kind === "abandon_run"
    ) {
      const thread = await deps.context.stores.threadStore.get(command.threadId);
      if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
        throw new Error(`thread ${command.threadId} not found in scope ${scopeKey(deps.scope)}`);
      }

      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);

      if (command.kind === "restart_run") {
        return deps.context.kernel.handleCommand({
          type: "restart_run",
          payload: { threadId: thread.threadId },
        });
      }
      if (command.kind === "resubmit_intent") {
        return deps.context.kernel.handleCommand({
          type: "resubmit_intent",
          payload: { threadId: thread.threadId, content: command.content },
        });
      }
      return deps.context.kernel.handleCommand({
        type: "abandon_run",
        payload: { threadId: thread.threadId },
      });
    }

    if (command.kind === "interrupt") {
      const threadId = command.threadId;
      if (!threadId) {
        const result = await deps.context.kernel.hydrateSession();
        return result ?? createEmptySessionResult(deps.scope);
      }
      const thread = await deps.context.stores.threadStore.get(threadId);
      if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
        throw new Error(`thread ${threadId} not found in scope ${scopeKey(deps.scope)}`);
      }
      const latestRun = await deps.context.stores.runStore.getLatestByThread(thread.threadId);

      if (!canInterruptLatestRun(latestRun) && thread.status !== "active") {
        const result = await deps.context.kernel.hydrateSession();
        if (!result) {
          throw new Error("failed to hydrate interrupted thread");
        }
        return result;
      }

      const cancelled = await deps.context.controlPlane.cancelThread(thread.threadId, "Interrupted from TUI");
      if (!cancelled) {
        // control-plane 未真正取消时，仍把 thread 保持为 active，
        // 避免 UI 误以为当前 thread 已经被切走。
        await deps.touchThread(thread, "active");
      }
      await deps.context.kernel.interrupts.interruptThread(thread.threadId, "Interrupted from TUI");

      const result = await deps.context.kernel.hydrateSession();
      if (!result) {
        throw new Error("failed to hydrate interrupted thread");
      }
      return result;
    }

    if (command.kind === "set_thread_mode" || command.kind === "clear_thread_mode") {
      const thread = await deps.context.stores.threadStore.get(command.threadId);
      if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
        throw new Error(`thread ${command.threadId} not found in scope ${scopeKey(deps.scope)}`);
      }

      await updateThreadMode({
        thread,
        nextMode: command.kind === "set_thread_mode" ? command.mode : DEFAULT_THREAD_MODE,
        trigger: command.trigger,
        reason: command.reason,
      });

      const result = await deps.context.kernel.hydrateSession();
      return result ?? createEmptySessionResult(deps.scope);
    }

    if (command.kind === "add_task") {
      // add_task 是 runtime protocol 到 kernel submit_input 的直接映射。
      await deps.ensureActiveThread();
      const result = await deps.context.kernel.handleCommand({
        type: "submit_input",
        payload: {
          text: command.content,
          background: command.background,
        },
      });
      deps.setActiveThreadId(result.threadId);
      return result;
    }

    if (command.kind === "plan_task") {
      // 兼容旧 plan_task：先把 thread truth 切到 plan，再沿普通提交路径进入 kernel。
      const thread = await deps.ensureActiveThread();
      await updateThreadMode({
        thread,
        nextMode: "plan",
        trigger: "compat_plan_task",
      });
      const result = await deps.context.kernel.handleCommand({
        type: "submit_input",
        payload: {
          text: command.content,
        },
      });
      deps.setActiveThreadId(result.threadId);
      return result;
    }

    if (command.kind === "worker_spawn") {
      const thread = command.threadId
        ? await deps.context.stores.threadStore.get(command.threadId)
        : await deps.ensureActiveThread();

      if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
        throw new Error(`thread ${command.threadId ?? "<active>"} not found in scope ${scopeKey(deps.scope)}`);
      }

      const workerManager = getWorkerManager();
      if (thread.status !== "active") {
        await deps.touchThread(transitionThread(thread, "active"));
      } else {
        await deps.touchThread(thread, "active");
      }

      const worker = await workerManager.spawn({
        threadId: thread.threadId,
        taskId: command.taskId,
        role: command.role,
        spawnReason: command.spawnReason,
        resumeToken: command.resumeToken,
      });
      deps.setActiveThreadId(thread.threadId);
      publishWorkerEvent("worker.spawned", toWorkerView(worker));

      return hydrateOrEmpty();
    }

    if (command.kind === "worker_inspect") {
      const thread = await getWorkerThread(command.workerId);
      if (!thread) {
        throw new Error(`worker ${command.workerId} not found in scope ${scopeKey(deps.scope)}`);
      }

      const workerManager = getWorkerManager();
      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);
      const worker = await workerManager.inspect(command.workerId);
      if (!worker) {
        throw new Error(`worker ${command.workerId} not found`);
      }
      publishWorkerEvent("worker.inspected", toWorkerView(worker));

      return hydrateOrEmpty();
    }

    if (command.kind === "worker_resume") {
      const thread = await getWorkerThread(command.workerId);
      if (!thread) {
        throw new Error(`worker ${command.workerId} not found in scope ${scopeKey(deps.scope)}`);
      }

      const workerManager = getWorkerManager();
      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);
      const worker = await workerManager.resume(command.workerId);
      publishWorkerEvent("worker.resumed", toWorkerView(worker));

      return hydrateOrEmpty();
    }

    if (command.kind === "worker_cancel") {
      const thread = await getWorkerThread(command.workerId);
      if (!thread) {
        throw new Error(`worker ${command.workerId} not found in scope ${scopeKey(deps.scope)}`);
      }

      const workerManager = getWorkerManager();
      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);
      const worker = await workerManager.cancel(command.workerId);
      publishWorkerEvent(worker.status === "failed" ? "worker.failed" : "worker.cancelled", toWorkerView(worker));

      return hydrateOrEmpty();
    }

    if (command.kind === "worker_join") {
      const thread = await getWorkerThread(command.workerId);
      if (!thread) {
        throw new Error(`worker ${command.workerId} not found in scope ${scopeKey(deps.scope)}`);
      }

      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);
      const worker = await getWorkerManager().join(command.workerId);
      publishWorkerEvent(worker.status === "failed" ? "worker.failed" : "worker.completed", toWorkerView(worker));
      return hydrateOrEmpty();
    }

    if (command.kind === "approve") {
      return deps.context.kernel.handleCommand({
        type: "approve_request",
        payload: { approvalRequestId: command.approvalRequestId },
      });
    }

    if (command.kind === "reject") {
      return deps.context.kernel.handleCommand({
        type: "reject_request",
        payload: { approvalRequestId: command.approvalRequestId },
      });
    }

    if (command.kind === "resolve_approval") {
      if (command.decision === "approved") {
        return deps.context.kernel.handleCommand({
          type: "approve_request",
          payload: { approvalRequestId: command.approvalRequestId },
        });
      }

      return deps.context.kernel.handleCommand({
        type: "reject_request",
        payload: { approvalRequestId: command.approvalRequestId },
      });
    }

    if (command.kind === "resolve_plan_decision") {
      const thread = await deps.context.stores.threadStore.get(command.threadId);
      if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
        throw new Error(`thread ${command.threadId} not found in scope ${scopeKey(deps.scope)}`);
      }

      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);
      return deps.context.kernel.handleCommand({
        type: "resolve_plan_decision",
        payload: {
          threadId: thread.threadId,
          runId: command.runId,
          optionId: command.optionId,
          optionLabel: command.optionLabel,
          input: command.input,
        },
      });
    }

    throw new Error("command not implemented");
  };
}
