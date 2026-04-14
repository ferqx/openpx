/** 
 * @module kernel/thread-service
 * 协作线服务（thread service）。
 * 
 * 提供协作线的创建和事件发布能力，
 * 是内核层创建新协作线并通知事件总线的入口。
 * 
 * 术语对照：thread=协作线，service=服务
 */
import { createThread } from "../domain/thread";
import type { ThreadStorePort } from "../persistence/ports/thread-store-port";
import type { KernelEvent } from "./event-bus";
import { prefixedUuid } from "../shared/id-generators";

/** 事件总线接口，仅需要发布能力 */
type EventBus = {
  publish: (event: KernelEvent) => void;
};

/** 创建协作线服务实例 */
export function createThreadService(deps: {
  threadStore: ThreadStorePort;
  events: EventBus;
  workspaceRoot?: string;
  projectId?: string;
}) {
  return {
    /** 创建新协作线、持久化并发布启动事件 */
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
