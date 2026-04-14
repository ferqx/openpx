/**
 * @module domain/event
 * 持久事件（durable event）领域实体。
 *
 * Event 是系统内各子系统间通信的持久化事件载体。
 * 与 stream-events（流式事件，面向前端实时推送）不同，
 * 此处的 durable event 面向持久化存储和状态回溯，
 * 记录 task 生命周期变更、thread 阻塞/视图更新、工具执行结果等。
 *
 * DurableEventType 采用 "域.动作" 命名风格，如 task.created、tool.executed。
 */
import { eventId as sharedEventId, taskId as sharedTaskId, threadId as sharedThreadId } from "../shared/ids";

/** 持久事件类型白名单——所有合法的 durable event type 均在此定义 */
export const durableEventTypes = [
  "task.created",    // task 创建
  "task.started",    // task 开始执行
  "task.updated",    // task 状态更新
  "task.completed",  // task 执行完成
  "task.failed",     // task 执行失败
  "thread.blocked",  // thread 被阻塞（等待审批或人工恢复）
  "thread.view_updated", // thread 投影视图（projected view）更新
  "tool.executed",   // 工具执行成功
  "tool.failed",     // 工具执行失败
] as const;

/** 持久事件类型——从 durableEventTypes 推导的联合类型 */
export type DurableEventType = (typeof durableEventTypes)[number];

/**
 * 类型守卫：判断给定字符串是否为合法的 DurableEventType。
 * 用于 createEvent 输入校验。
 */
function isDurableEventType(value: string): value is DurableEventType {
  return (durableEventTypes as readonly string[]).includes(value);
}

/**
 * 持久事件——系统内子系统间通信的持久化载体。
 * 每个 Event 关联到一条 thread，可选关联到一个 task，
 * 并携带类型化的 payload 用于下游消费。
 */
export type Event = {
  /** eventId——事件唯一标识 */
  eventId: ReturnType<typeof sharedEventId>;
  /** threadId——所属协作线标识 */
  threadId: ReturnType<typeof sharedThreadId>;
  /** taskId——所属具体步骤标识（可选，部分事件不关联 task） */
  taskId?: ReturnType<typeof sharedTaskId>;
  /** type——持久事件类型，如 task.created、tool.executed */
  type: DurableEventType;
  /** payload——事件负载，类型取决于 event type */
  payload?: Record<string, unknown>;
  /** createdAt——事件创建时间（ISO 8601） */
  createdAt?: string;
};

/**
 * 创建持久事件工厂函数。
 * 校验 type 是否在白名单内，否则抛出异常；
 * 对所有 ID 字段施加品牌类型（branded type）包装。
 */
export function createEvent(input: {
  eventId: string;
  threadId: string;
  taskId?: string;
  type: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
}): Event {
  if (!isDurableEventType(input.type)) {
    throw new Error(`Unsupported durable event type: ${input.type}`);
  }

  return {
    eventId: sharedEventId(input.eventId),
    threadId: sharedThreadId(input.threadId),
    taskId: input.taskId ? sharedTaskId(input.taskId) : undefined,
    type: input.type,
    payload: input.payload,
    createdAt: input.createdAt,
  };
}
