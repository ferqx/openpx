import type { TuiKernel, TuiKernelEvent } from "../tui/hooks/use-kernel";
import type { RuntimeClient } from "./runtime-client";
import type { SubmitInputCommand, ApprovalCommand } from "../tui/commands";

export function createRemoteKernel(client: RuntimeClient): TuiKernel {
  const handlers = new Set<(event: TuiKernelEvent) => void>();
  let lastRuntimeStatus: "connected" | "disconnected" = "disconnected";

  function emitRuntimeStatus(status: "connected" | "disconnected") {
    lastRuntimeStatus = status;
    for (const handler of handlers) {
      handler({ type: "runtime.status", payload: { status } });
    }
  }

  // Start event subscription in background
  (async () => {
    while (true) {
      try {
        const events = client.subscribeEvents();
        emitRuntimeStatus("connected");
        for await (const envelope of events) {
          for (const handler of handlers) {
            handler(envelope.event);
          }
        }
      } catch (e) {
        emitRuntimeStatus("disconnected");
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  })();

  return {
    events: {
      subscribe(handler) {
        handlers.add(handler);
        // Immediately notify of current status
        handler({ type: "runtime.status", payload: { status: lastRuntimeStatus } });
        return () => handlers.delete(handler);
      },
    },
    async handleCommand(command: SubmitInputCommand | ApprovalCommand) {
      if (command.type === "submit_input") {
        await client.sendCommand({ kind: "add_task", content: command.payload.text });
      } else if (command.type === "approve_request") {
        await client.sendCommand({ kind: "approve", approvalRequestId: command.payload.approvalRequestId });
      } else if (command.type === "reject_request") {
        await client.sendCommand({ kind: "reject", approvalRequestId: command.payload.approvalRequestId });
      }
      
      // After command, return a full hydration to update UI state immediately
      return this.hydrateSession?.();
    },
    async hydrateSession() {
      const snapshot = await client.getSnapshot();
      return {
        threadId: snapshot.activeThreadId,
        summary: snapshot.answers.at(-1)?.content ?? "Awaiting answer",
        tasks: snapshot.tasks,
        approvals: snapshot.pendingApprovals,
        workspaceRoot: snapshot.workspaceRoot,
        projectId: snapshot.projectId,
        recommendationReason: (snapshot as any).recommendationReason,
      };
    },
  };
}
