import { createThread } from "../domain/thread";
import type { ThreadStorePort } from "../persistence/ports/thread-store-port";
import type { KernelEvent } from "./event-bus";
import { prefixedUuid } from "../shared/id-generators";

type EventBus = {
  publish: (event: KernelEvent) => void;
};

export function createThreadService(deps: {
  threadStore: ThreadStorePort;
  events: EventBus;
  workspaceRoot?: string;
  projectId?: string;
}) {
  return {
    async startThread() {
      const thread = createThread(
        prefixedUuid("thread"),
        deps.workspaceRoot ?? "",
        deps.projectId ?? "",
      );
      await deps.threadStore.save(thread);
      deps.events.publish({ type: "thread.started", payload: thread });
      return thread;
    },
  };
}
