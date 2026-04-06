import type { KernelEvent } from "./event-bus";

type EventBus = {
  publish: (event: KernelEvent) => void;
};

export function createInterruptService(deps: {
  events: EventBus;
}) {
  return {
    async interruptThread(threadId: string, reason?: string) {
      deps.events.publish({ type: "thread.interrupted", payload: { threadId, reason } });
    },
  };
}
