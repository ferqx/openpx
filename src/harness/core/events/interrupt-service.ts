/**
 * @module harness/core/events/interrupt-service
 * harness 中断服务（interrupt service）。
 *
 * 它负责把协作线中断请求转换成统一事件，
 * 让 harness 内部其他模块以同一语义感知中断。
 */
import type { KernelEvent } from "./event-bus";

type EventBus = {
  publish: (event: KernelEvent) => void;
};

/** 创建中断服务。 */
export function createInterruptService(deps: {
  events: EventBus;
}) {
  return {
    /** 发布指定协作线的中断事件。 */
    async interruptThread(threadId: string, reason?: string) {
      deps.events.publish({ type: "thread.interrupted", payload: { threadId, reason } });
    },
  };
}
