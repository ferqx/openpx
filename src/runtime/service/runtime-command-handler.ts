import { createAppContext } from "../../app/bootstrap";
import { createThread, type Thread } from "../../domain/thread";
import type { RuntimeScope } from "./runtime-scope";
import type { RuntimeCommand } from "./runtime-types";

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

export function createRuntimeCommandHandler(deps: RuntimeCommandHandlerDeps) {
  return async function handleRuntimeCommand(command: RuntimeCommand): Promise<void> {
    if (command.kind === "new_thread") {
      const thread = createThread(crypto.randomUUID(), deps.scope.workspaceRoot, deps.scope.projectId);
      await deps.context.stores.threadStore.save(thread);
      deps.setActiveThreadId(thread.threadId);
      return;
    }

    if (command.kind === "switch_thread" || command.kind === "continue") {
      const thread = await deps.context.stores.threadStore.get(command.threadId);
      if (!thread || thread.workspaceRoot !== deps.scope.workspaceRoot || thread.projectId !== deps.scope.projectId) {
        throw new Error(`thread ${command.threadId} not found in scope ${scopeKey(deps.scope)}`);
      }

      const nextStatus =
        command.kind === "continue" && (thread.status === "interrupted" || thread.status === "blocked")
          ? "active"
          : undefined;
      await deps.touchThread(thread, nextStatus);
      return;
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
      return;
    }

    if (command.kind === "approve") {
      await deps.context.kernel.handleCommand({
        type: "approve_request",
        payload: { approvalRequestId: command.approvalRequestId },
      });
      return;
    }

    if (command.kind === "reject") {
      await deps.context.kernel.handleCommand({
        type: "reject_request",
        payload: { approvalRequestId: command.approvalRequestId },
      });
      return;
    }

    throw new Error("command not implemented");
  };
}
