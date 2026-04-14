import { createAppContext } from "../../app/bootstrap";
import type { Run } from "../../domain/run";
import { createThread, type Thread } from "../../domain/thread";
import { transitionThread } from "../../domain/thread";
import type { RuntimeScope } from "./runtime-scope";
import type { RuntimeCommand } from "./runtime-types";
import type { SessionCommandResult } from "../../kernel/session-kernel";
import type { WorkerView } from "./protocol/worker-view";

type AppContext = Awaited<ReturnType<typeof createAppContext>>;

/** runtime 命令处理器依赖：负责 scope 校验、active thread 管理和上下文访问 */
type RuntimeCommandHandlerDeps = {
  scope: RuntimeScope;
  context: AppContext;
  ensureActiveThread: () => Promise<Thread>;
  touchThread: (thread: Thread, nextStatus?: Thread["status"]) => Promise<Thread>;
  setActiveThreadId: (threadId: string) => void;
};

/** 作用域键——用于报错与缓存命中时的人类可读标识 */
function scopeKey(scope: RuntimeScope): string {
  return `${scope.workspaceRoot}::${scope.projectId}`;
}

/** 当 scope 下还没有任何 thread 时，返回一份稳定的空会话结果 */
function createEmptySessionResult(scope: RuntimeScope): SessionCommandResult {
  return {
    threadId: "",
    status: "completed",
    summary: "Awaiting answer",
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
      // 当前通过 plan: 前缀把“规划请求”编码进普通 submit_input，
      // 具体如何路由由 root graph / planner normalization 决定。
      await deps.ensureActiveThread();
      const result = await deps.context.kernel.handleCommand({
        type: "submit_input",
        payload: {
          text: `plan: ${command.content}`,
        },
      });
      deps.setActiveThreadId(result.threadId);
      return result;
    }

    if (command.kind === "worker_spawn") {
      const thread =
        command.threadId
          ? await deps.context.stores.threadStore.get(command.threadId)
          : await deps.ensureActiveThread();
      if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
        throw new Error(`thread ${command.threadId ?? ""} not found in scope ${scopeKey(deps.scope)}`);
      }

      if (thread.status !== "active") {
        await deps.touchThread(transitionThread(thread, "active"));
      } else {
        await deps.touchThread(thread, "active");
      }

      // worker 生命周期事件先发到 kernel，再由 runtime/tui 统一消费。
      const worker = await getWorkerManager().spawn({
        role: command.role,
        taskId: command.taskId,
        threadId: thread.threadId,
        spawnReason: command.spawnReason,
        resumeToken: command.resumeToken,
      });
      deps.setActiveThreadId(thread.threadId);
      publishWorkerEvent("worker.spawned", toWorkerView(worker));
      return await hydrateOrEmpty();
    }

    if (command.kind === "worker_inspect") {
      const thread = await getWorkerThread(command.workerId);
      if (!thread) {
        throw new Error(`worker ${command.workerId} not found in scope ${scopeKey(deps.scope)}`);
      }
      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);
      const worker = await getWorkerManager().inspect(command.workerId);
      if (!worker) {
        throw new Error(`worker ${command.workerId} not found`);
      }
      publishWorkerEvent("worker.inspected", toWorkerView(worker));
      return await hydrateOrEmpty();
    }

    if (command.kind === "worker_resume") {
      const thread = await getWorkerThread(command.workerId);
      if (!thread) {
        throw new Error(`worker ${command.workerId} not found in scope ${scopeKey(deps.scope)}`);
      }
      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);
      const worker = await getWorkerManager().resume(command.workerId);
      publishWorkerEvent("worker.resumed", toWorkerView(worker));
      return await hydrateOrEmpty();
    }

    if (command.kind === "worker_cancel") {
      const thread = await getWorkerThread(command.workerId);
      if (!thread) {
        throw new Error(`worker ${command.workerId} not found in scope ${scopeKey(deps.scope)}`);
      }
      await deps.touchThread(thread, "active");
      deps.setActiveThreadId(thread.threadId);
      const worker = await getWorkerManager().cancel(command.workerId);
      publishWorkerEvent(worker.status === "failed" ? "worker.failed" : "worker.cancelled", toWorkerView(worker));
      return await hydrateOrEmpty();
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
      return await hydrateOrEmpty();
    }

    if (command.kind === "approve") {
      return await deps.context.kernel.handleCommand({
        type: "approve_request",
        payload: { approvalRequestId: command.approvalRequestId },
      });
    }

    if (command.kind === "reject") {
      return await deps.context.kernel.handleCommand({
        type: "reject_request",
        payload: { approvalRequestId: command.approvalRequestId },
      });
    }

    if (command.kind === "resolve_approval") {
      if (command.decision === "approved") {
        return await deps.context.kernel.handleCommand({
          type: "approve_request",
          payload: { approvalRequestId: command.approvalRequestId },
        });
      }

      return await deps.context.kernel.handleCommand({
        type: "reject_request",
        payload: { approvalRequestId: command.approvalRequestId },
      });
    }

    throw new Error("command not implemented");
  };
}
