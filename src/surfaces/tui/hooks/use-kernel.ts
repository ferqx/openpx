import { useEffect, useState } from "react";
import type { ApprovalCommand, PlanDecisionCommand, PlanInputCommand, SubmitInputCommand, ThreadCommand } from "../commands";
import type { RuntimeEvent } from "../../../harness/protocol/schemas/api-schema";
import type { RuntimeSessionState } from "../runtime/runtime-session";
import type { SessionUpdatedEvent } from "../runtime/tui-session-event";

/** runtime 连接状态事件 */
export type RuntimeStatusEvent = {
  type: "runtime.status";
  payload: {
    status: "connected" | "disconnected";
  };
};

/** TUI 侧统一消费的 kernel 事件联合类型 */
export type TuiKernelEvent = RuntimeEvent | RuntimeStatusEvent | SessionUpdatedEvent;
export type TuiSessionResult = RuntimeSessionState;

/** TUI 与 kernel 之间的最小接口 */
export type TuiKernel = {
  events: {
    subscribe: (handler: (event: TuiKernelEvent) => void) => () => void;
  };
  handleCommand: (command: SubmitInputCommand | PlanInputCommand | PlanDecisionCommand | ApprovalCommand | ThreadCommand) => Promise<TuiSessionResult>;
  hydrateSession?: () => Promise<TuiSessionResult | undefined>;
  interruptCurrentThread?: () => Promise<TuiSessionResult | undefined>;
};

/** useKernel：把事件订阅转成 React state */
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
