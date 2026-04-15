/**
 * @module harness/core/thread/thread-service
 * harness 协作线服务（thread service）。
 *
 * 它负责创建新的 durable thread，并将启动事件推送到 harness 事件总线。
 */
import { createThread } from "../../../domain/thread";
import type { ThreadStorePort } from "../../../persistence/ports/thread-store-port";
import { prefixedUuid } from "../../../shared/id-generators";
import type { KernelEvent } from "../events/event-bus";

type EventBus = {
  publish: (event: KernelEvent) => void;
};

/** 创建协作线服务。 */
export function createThreadService(deps: {
  threadStore: ThreadStorePort;
  events: EventBus;
  workspaceRoot?: string;
  projectId?: string;
}) {
  return {
    /** 创建新协作线并广播启动事件。 */
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
