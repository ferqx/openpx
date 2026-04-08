import { createAppContext } from "../../app/bootstrap";
import type { Run } from "../../domain/run";
import { createThread, type Thread } from "../../domain/thread";
import type { RuntimeScope } from "./runtime-scope";
import type { RuntimeCommand } from "./runtime-types";
import type { SessionCommandResult } from "../../kernel/session-kernel";

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
