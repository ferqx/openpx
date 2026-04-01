import type { KernelEvent } from "./event-bus";

type EventBus<TEvent extends KernelEvent> = {
  publish: (event: TEvent) => void;
};

export function createInterruptService<TEvent extends KernelEvent = KernelEvent>(deps: {
  events: EventBus<TEvent>;
}) {
  return {
    async interruptThread(threadId: string, reason?: string) {
      deps.events.publish({ type: "thread.interrupted", payload: { threadId, reason } } as TEvent);
    },
  };
}
