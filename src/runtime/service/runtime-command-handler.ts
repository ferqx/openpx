import { createAppContext } from "../../app/bootstrap";
import type { Run } from "../../domain/run";
import { createThread, type Thread } from "../../domain/thread";
import { transitionThread } from "../../domain/thread";
import type { RuntimeScope } from "./runtime-scope";
import type { RuntimeCommand } from "./runtime-types";
import type { SessionCommandResult } from "../../kernel/session-kernel";
import type { WorkerView } from "./protocol/worker-view";

type AppContext = Awaited<ReturnType<typeof createAppContext>>;

type RuntimeCommandHandlerDeps = {
  scope: RuntimeScope;
  context: AppContext;
  ensureActiveThread: () => Promise<Thread>;
  touchThread: (thread: Thread, nextStatus?: Thread["status"]) => Promise<Thread>;
  setActiveThreadId: (threadId: string) => void;
};

function scopeKey(scope: RuntimeScope): string {
  return `${scope.workspaceRoot}::${scope.projectId}`;
}

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

function canResumeLatestRun(run: Run | undefined): boolean {
  return run?.status === "blocked" || run?.status === "interrupted";
}

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
