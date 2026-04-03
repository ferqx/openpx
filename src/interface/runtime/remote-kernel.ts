import type { TuiKernel, TuiKernelEvent } from "../tui/hooks/use-kernel";
import type { RuntimeClient } from "./runtime-client";
import type { SubmitInputCommand, ApprovalCommand } from "../tui/commands";

export function createRemoteKernel(client: RuntimeClient): TuiKernel {
  const handlers = new Set<(event: TuiKernelEvent) => void>();

  // Start event subscription in background
  (async () => {
    try {
      for await (const envelope of client.subscribeEvents()) {
        for (const handler of handlers) {
          handler(envelope.event);
        }
      }
    } catch (e) {
      console.error("Event subscription failed", e);
    }
  })();

  return {
    events: {
      subscribe(handler) {
        handlers.add(handler);
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
      };
    },
  };
}
