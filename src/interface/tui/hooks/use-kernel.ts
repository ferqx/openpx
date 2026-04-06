import { useEffect, useState } from "react";
import { parseCommand, type ApprovalCommand, type SubmitInputCommand, type ThreadCommand } from "../commands";
import type { RuntimeEvent } from "../../../runtime/service/runtime-types";
import type { RuntimeSessionState } from "../../runtime/runtime-session";
import type { SessionUpdatedEvent } from "../../runtime/tui-session-event";

export type RuntimeStatusEvent = {
  type: "runtime.status";
  payload: {
    status: "connected" | "disconnected";
  };
};

export type TuiKernelEvent = RuntimeEvent | RuntimeStatusEvent | SessionUpdatedEvent;
export type TuiSessionResult = RuntimeSessionState;

export type TuiKernel = {
  events: {
    subscribe: (handler: (event: TuiKernelEvent) => void) => () => void;
  };
  handleCommand: (command: SubmitInputCommand | ApprovalCommand | ThreadCommand) => Promise<TuiSessionResult>;
  hydrateSession?: () => Promise<TuiSessionResult | undefined>;
};

export function useKernel(kernel: TuiKernel) {
  const [events, setEvents] = useState<TuiKernelEvent[]>([]);

  useEffect(() => {
    return kernel.events.subscribe((event) => {
      setEvents((current) => [...current, event]);
    });
  }, [kernel]);

  async function submit(text: string) {
    const value = text.trim();
    if (!value) {
      return;
    }

    await kernel.handleCommand(parseCommand(value));
  }

  return {
    events,
    submit,
  };
}
