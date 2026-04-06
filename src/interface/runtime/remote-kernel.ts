import type { RuntimeStatusEvent, TuiKernel, TuiKernelEvent } from "../tui/hooks/use-kernel";
import type { RuntimeClient } from "./runtime-client";
import type { SubmitInputCommand, PlanInputCommand, ApprovalCommand, ThreadCommand } from "../tui/commands";
import { deriveRuntimeSession, formatThreadListSummary } from "./runtime-session";
import type { SessionUpdatedEvent } from "./tui-session-event";

type RemoteRuntimeClient = Pick<RuntimeClient, "getSnapshot" | "sendCommand" | "subscribeEvents">;

export function createRemoteKernel(client: RemoteRuntimeClient): TuiKernel {
  const handlers = new Set<(event: TuiKernelEvent) => void>();
  let lastRuntimeStatus: "connected" | "disconnected" = "disconnected";
  let eventLoopStarted = false;

  const hydrateSession = async () => {
    const snapshot = await client.getSnapshot();
    return deriveRuntimeSession(snapshot);
  };

  const interruptCurrentThread = async () => {
    const snapshot = await client.getSnapshot();
    await client.sendCommand({ kind: "interrupt", threadId: snapshot.activeThreadId });
    return hydrateSession();
  };

  function emitRuntimeStatus(status: "connected" | "disconnected") {
    lastRuntimeStatus = status;
    const event: RuntimeStatusEvent = { type: "runtime.status", payload: { status } };
    for (const handler of handlers) {
      handler(event);
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
          
          // Whenever we connect/reconnect, trigger a hydration to sync state
          // This ensures we catch up on events missed during disconnect.
          void (async () => {
            try {
              const result = await hydrateSession();
              if (result) {
                const hydrationEvent: SessionUpdatedEvent = {
                  type: "session.updated",
                  payload: result,
                };
                for (const handler of handlers) {
                  handler(hydrationEvent);
                }
              }
            } catch (e) {
              // Ignore hydration errors during initial connection
            }
          })();

          for await (const envelope of events) {
            for (const handler of handlers) {
              handler(envelope.event);
            }
          }
        } catch (e) {
          emitRuntimeStatus("disconnected");
          // Wait briefly before retrying
          await new Promise((resolve) => setTimeout(resolve, 2000));
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
        const event: RuntimeStatusEvent = {
          type: "runtime.status",
          payload: { status: lastRuntimeStatus },
        };
        handler(event);
        return () => handlers.delete(handler);
      },
    },
    async handleCommand(command: SubmitInputCommand | PlanInputCommand | ApprovalCommand | ThreadCommand) {
      if (command.type === "submit_input") {
        await client.sendCommand({ kind: "add_task", content: command.payload.text });
      } else if (command.type === "plan_input") {
        await client.sendCommand({ kind: "plan_task", content: command.payload.text });
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
          return hydrateSession();
        }
        await client.sendCommand({ kind: "continue", threadId });
      } else if (command.type === "thread_list") {
        const snapshot = await client.getSnapshot();
        const session = deriveRuntimeSession(snapshot);
        return {
          ...session,
          summary: formatThreadListSummary(session),
        };
      }
      
      // After command, return a full hydration to update UI state immediately
      return hydrateSession();
    },
    hydrateSession,
    interruptCurrentThread,
  };
}
