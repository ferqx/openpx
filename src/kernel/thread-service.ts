import type { KernelEvent } from "./event-bus";

type EventBus<TEvent extends KernelEvent> = {
  publish: (event: TEvent) => void;
};

export type ThreadRecord = {
  threadId: string;
};

export type ThreadStore = {
  createThread: () => Promise<ThreadRecord>;
};

export function createThreadService<TEvent extends KernelEvent = KernelEvent>(deps: {
  threadStore: ThreadStore;
  events: EventBus<TEvent>;
}) {
  return {
    async startThread() {
      const thread = await deps.threadStore.createThread();
      deps.events.publish({ type: "thread.started", payload: thread } as TEvent);
      return thread;
    },
  };
}
