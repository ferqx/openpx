/** 
 * @module kernel/interrupt-service
 * 中断服务（interrupt service）。
 * 
 * 提供协作线中断能力，通过事件总线发布中断事件，
 * 通知运行时停止当前执行。
 * 
 * 术语对照：interrupt=中断，thread=协作线
 */
import type { KernelEvent } from "./event-bus";

/** 事件总线接口，仅需要发布能力 */
type EventBus = {
  publish: (event: KernelEvent) => void;
};

/** 创建中断服务实例 */
export function createInterruptService(deps: {
  events: EventBus;
}) {
  return {
    /** 中断指定协作线，发布 thread.interrupted 事件 */
    async interruptThread(threadId: string, reason?: string) {
      deps.events.publish({ type: "thread.interrupted", payload: { threadId, reason } });
    },
  };
}
