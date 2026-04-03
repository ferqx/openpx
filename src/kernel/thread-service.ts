import { createThread } from "../domain/thread";
import type { ThreadStorePort } from "../persistence/ports/thread-store-port";
import type { KernelEvent } from "./event-bus";

type EventBus<TEvent extends KernelEvent> = {
  publish: (event: TEvent) => void;
};

export function createThreadService<TEvent extends KernelEvent = KernelEvent>(deps: {
  threadStore: ThreadStorePort;
  events: EventBus<TEvent>;
  workspaceRoot?: string;
  projectId?: string;
}) {
  return {
    async startThread() {
      const thread = createThread(
        crypto.randomUUID(),
        deps.workspaceRoot ?? "",
        deps.projectId ?? "",
      );
      await deps.threadStore.save(thread);
      deps.events.publish({ type: "thread.started", payload: thread } as TEvent);
      return thread;
    },
  };
}
