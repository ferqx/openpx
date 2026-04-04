import type { TuiKernel, TuiKernelEvent } from "../tui/hooks/use-kernel";
import type { RuntimeClient } from "./runtime-client";
import type { SubmitInputCommand, ApprovalCommand, ThreadCommand } from "../tui/commands";
import { deriveRuntimeSession } from "./runtime-session";

export function createRemoteKernel(client: RuntimeClient): TuiKernel {
  const handlers = new Set<(event: TuiKernelEvent) => void>();
  let lastRuntimeStatus: "connected" | "disconnected" = "disconnected";
  let eventLoopStarted = false;

  function emitRuntimeStatus(status: "connected" | "disconnected") {
    lastRuntimeStatus = status;
    for (const handler of handlers) {
      handler({ type: "runtime.status", payload: { status } });
    }
  }

  function ensureEventLoop() {
    if (eventLoopStarted) {
      return;
    }

    eventLoopStarted = true;

    void (async () => {
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
  }

  return {
    events: {
      subscribe(handler) {
        ensureEventLoop();
        handlers.add(handler);
        // Immediately notify of current status
        handler({ type: "runtime.status", payload: { status: lastRuntimeStatus } });
        return () => handlers.delete(handler);
      },
    },
    async handleCommand(command: SubmitInputCommand | ApprovalCommand | ThreadCommand) {
      if (command.type === "submit_input") {
        await client.sendCommand({ kind: "add_task", content: command.payload.text });
      } else if (command.type === "approve_request") {
        await client.sendCommand({ kind: "approve", approvalRequestId: command.payload.approvalRequestId });
      } else if (command.type === "reject_request") {
        await client.sendCommand({ kind: "reject", approvalRequestId: command.payload.approvalRequestId });
      } else if (command.type === "thread_new") {
        await client.sendCommand({ kind: "new_thread" });
      } else if (command.type === "thread_switch") {
        await client.sendCommand({ kind: "switch_thread", threadId: command.payload.threadId });
      } else if (command.type === "thread_continue") {
        const snapshot = await client.getSnapshot();
        const threadId = command.payload.threadId ?? snapshot.activeThreadId;
        if (!threadId) {
          return deriveRuntimeSession(snapshot);
        }
        await client.sendCommand({ kind: "continue", threadId });
      } else if (command.type === "thread_list") {
        const snapshot = await client.getSnapshot();
        const session = deriveRuntimeSession(snapshot);
        const lines = session.threads.map((thread) =>
          [
            `${thread.threadId}${thread.threadId === session.threadId ? " (active)" : ""} [${thread.status}]`,
            thread.narrativeSummary,
          ]
            .filter(Boolean)
            .join(" "),
        );
        return {
          ...session,
          summary: lines.length > 0 ? lines.join("\n") : "No threads available.",
        };
      }
      
      // After command, return a full hydration to update UI state immediately
      return this.hydrateSession?.();
    },
    async hydrateSession() {
      const snapshot = await client.getSnapshot();
      return deriveRuntimeSession(snapshot);
    },
  };
}
