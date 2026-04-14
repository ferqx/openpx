/** 
 * @module kernel/event-bus
 * 事件总线（event bus）。
 * 
 * 内核层的事件发布/订阅机制，支持两种事件通道：
 * 1. KernelEvent 通道——发布内核级事件（线程启动、中断、视图更新等）
 * 2. StreamEvent 通道——转发 LLM 流式推理事件（思考分块、文本分块等）
 * 
 * 术语对照：event bus=事件总线，publish=发布，subscribe=订阅，
 * stream=流式，thread=协作线，worker=工作单元
 */
import type { StreamEvent } from "../domain/stream-events";
import type { Thread } from "../domain/thread";
import type { WorkerView } from "../runtime/service/protocol/worker-view";
import type { ProjectedSessionResult } from "./session-view-projector";
import type { ModelGatewayEvent, ModelStatus } from "../infra/model-gateway";

/** 协作线启动事件 */
export type ThreadStartedKernelEvent = {
  type: "thread.started";        // 协作线已启动
  payload: Thread;                // 启动的协作线实体
};

/** 协作线中断事件 */
export type ThreadInterruptedKernelEvent = {
  type: "thread.interrupted";     // 协作线被中断
  payload: {
    threadId: string;
    reason?: string;
  };
};

/** 协作线视图更新事件 */
export type ThreadViewUpdatedKernelEvent = {
  type: "thread.view_updated";   // 协作线视图已更新
  payload: ProjectedSessionResult; // 投影后的会话结果
};

/** 具体步骤失败事件 */
export type TaskFailedKernelEvent = {
  type: "task.failed";            // 具体步骤执行失败
  payload: {
    threadId: string;
    error: string;
  };
};

/** 工作单元生命周期事件 */
export type WorkerKernelEvent = {
  type:
    | "worker.spawned"
    | "worker.inspected"
    | "worker.resumed"
    | "worker.cancelled"
    | "worker.completed"
    | "worker.failed";
  payload: {
    worker: WorkerView;
  };
};

/** 模型状态变更事件 */
export type ModelStatusKernelEvent = {
  type: "model.status";           // 模型状态变更
  payload: {
    status: ModelStatus;
  };
};

/** 所有内核事件的联合类型 */
export type KernelEvent =
  | ThreadStartedKernelEvent
  | ThreadInterruptedKernelEvent
  | ThreadViewUpdatedKernelEvent
  | TaskFailedKernelEvent
  | WorkerKernelEvent
  | ModelStatusKernelEvent
  | ModelGatewayEvent;

/** 流式内核事件——从 LLM 流式推理转发 */
type StreamKernelEvent = {
  type: StreamEvent["type"];
  payload: StreamEvent["payload"];
};

/** 内核事件处理器类型 */
export type EventHandler<TEvent extends KernelEvent = KernelEvent> = (event: TEvent) => void;
/** 流式事件处理器类型 */
export type StreamEventHandler = (event: StreamKernelEvent) => void;

/** 创建事件总线实例，提供内核事件和流式事件的发布/订阅机制 */
export function createEventBus<TEvent extends KernelEvent = KernelEvent>() {
  // 内核事件处理器集合
  const handlers = new Set<EventHandler<TEvent>>();
  // 流式事件处理器集合
  const streamHandlers = new Set<StreamEventHandler>();

  return {
    /** 发布内核事件到所有已注册的处理器 */
    publish(event: TEvent) {
      handlers.forEach((handler) => handler(event));
    },
    /** 将 LLM 流式事件转换为内核事件格式后发布 */
    publishStream(event: StreamEvent) {
      const kernelEvent: StreamKernelEvent = {
        type: event.type,
        payload: event.payload,
      };
      streamHandlers.forEach((handler) => handler(kernelEvent));
    },
    /** 订阅内核事件，返回取消订阅函数 */
    subscribe(handler: EventHandler<TEvent>) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    /** 订阅流式事件，返回取消订阅函数 */
    subscribeStream(handler: StreamEventHandler) {
      streamHandlers.add(handler);
      return () => {
        streamHandlers.delete(handler);
      };
    },
  };
}
