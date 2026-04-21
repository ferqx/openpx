/**
 * TUI surface 的 remote kernel adapter。
 *
 * 它把 harness protocol client 翻译成 TUI kernel 语义：
 * - snapshot -> RuntimeSessionState
 * - protocol events -> TuiKernelEvent
 * - TUI commands -> harness commands
 *
 * 它不持有核心业务真相，只负责 surface 侧的适配。
 */
import type { RuntimeStatusEvent, TuiKernel, TuiKernelEvent } from "../hooks/use-kernel";
import type { RuntimeClient } from "./runtime-client";
import type {
  ApprovalCommand,
  PlanDecisionCommand,
  PlanInputCommand,
  SubmitInputCommand,
  ThreadCommand,
} from "../commands";
import { deriveRuntimeSession, formatThreadListSummary } from "./runtime-session";
import type { SessionUpdatedEvent } from "./tui-session-event";

type RemoteRuntimeClient = Pick<RuntimeClient, "getSnapshot" | "sendCommand" | "subscribeEvents">;

export function createRemoteKernel(client: RemoteRuntimeClient): TuiKernel {
  const handlers = new Set<(event: TuiKernelEvent) => void>();
  let lastRuntimeStatus: "connected" | "disconnected" = "disconnected";
  let eventLoopStarted = false;
  let lastEventSeq = 0;

  const hydrateSession = async () => {
    const snapshot = await client.getSnapshot();
    lastEventSeq = Math.max(lastEventSeq, snapshot.lastEventSeq ?? 0);
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
          emitRuntimeStatus("connected");
          const hydrated = await hydrateSession();
          const hydrationEvent: SessionUpdatedEvent = {
            type: "session.updated",
            payload: hydrated,
          };
          for (const handler of handlers) {
            handler(hydrationEvent);
          }

          const events = client.subscribeEvents(lastEventSeq);

          for await (const envelope of events) {
            lastEventSeq = Math.max(lastEventSeq, envelope.seq);
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
    async handleCommand(command: SubmitInputCommand | PlanInputCommand | PlanDecisionCommand | ApprovalCommand | ThreadCommand) {
      // 这里负责把 TUI command vocabulary 翻译成 harness protocol vocabulary。
      // 这是 surface adapter 的职责，不应回流到 harness core。
      if (command.type === "submit_input") {
        const snapshot = await client.getSnapshot();
        if (snapshot.activeThreadId) {
          await client.sendCommand({
            kind: "clear_thread_mode",
            threadId: snapshot.activeThreadId,
            trigger: "plain_input",
          });
        }
        await client.sendCommand({ kind: "add_task", content: command.payload.text });
      } else if (command.type === "plan_input") {
        const snapshot = await client.getSnapshot();
        if (snapshot.activeThreadId) {
          await client.sendCommand({
            kind: "set_thread_mode",
            threadId: snapshot.activeThreadId,
            mode: "plan",
            trigger: "slash_command",
          });
          await client.sendCommand({ kind: "add_task", content: command.payload.text });
        } else {
          await client.sendCommand({ kind: "plan_task", content: command.payload.text });
        }
      } else if (command.type === "approve_request") {
        await client.sendCommand({ kind: "approve", approvalRequestId: command.payload.approvalRequestId });
      } else if (command.type === "reject_request") {
        await client.sendCommand({ kind: "reject", approvalRequestId: command.payload.approvalRequestId });
      } else if (command.type === "resolve_plan_decision") {
        const snapshot = await client.getSnapshot();
        if (!snapshot.activeThreadId || !snapshot.activeRunId) {
          return hydrateSession();
        }
        await client.sendCommand({
          kind: "resolve_plan_decision",
          threadId: snapshot.activeThreadId,
          runId: snapshot.activeRunId,
          optionId: command.payload.optionId,
          optionLabel: command.payload.optionLabel,
          input: command.payload.input,
        });
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
          finalResponse: formatThreadListSummary(session),
        };
      }
      
      // After command, return a full hydration to update UI state immediately
      return hydrateSession();
    },
    hydrateSession,
    interruptCurrentThread,
  };
}
