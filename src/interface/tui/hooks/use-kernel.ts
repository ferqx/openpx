import { useEffect, useState } from "react";
import type { ApprovalCommand, PlanInputCommand, SubmitInputCommand, ThreadCommand } from "../commands";
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
  handleCommand: (command: SubmitInputCommand | PlanInputCommand | ApprovalCommand | ThreadCommand) => Promise<TuiSessionResult>;
  hydrateSession?: () => Promise<TuiSessionResult | undefined>;
  interruptCurrentThread?: () => Promise<TuiSessionResult | undefined>;
};

export function useKernel(kernel: TuiKernel) {
  const [events, setEvents] = useState<TuiKernelEvent[]>([]);

  useEffect(() => {
    return kernel.events.subscribe((event) => {
      setEvents((current) => [...current, event]);
    });
  }, [kernel]);
  return {
    events,
  };
}
