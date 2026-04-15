/**
 * @module domain/stream-events
 * 流式事件（stream event）领域实体。
 *
 * 与 domain/event（持久事件，面向存储和状态回溯）不同，
 * StreamEvent 面向前端实时推送，描述 LLM 推理和工具执行过程中的
 * 逐条流式输出，包括思考过程、文本片段和工具调用生命周期。
 *
 * 所有流式事件类型以 "stream." 为前缀，便于与 durable event 区分。
 * 每条 StreamEvent 携带 seq（序号）确保客户端可按序重组。
 */

/** 流式事件公共基础字段 */
type StreamEventBase = {
  /** eventId——事件唯一标识 */
  eventId: string;
  /** threadId——所属协作线标识 */
  threadId: string;
  /** taskId——所属具体步骤标识 */
  taskId: string;
  /** turnId——当前轮次标识 */
  turnId: string;
  /** seq——事件序号，用于客户端按序重组 */
  seq: number;
  /** timestamp——事件时间戳（ISO 8601） */
  timestamp: string;
};

/**
 * 思考开始事件——LLM 开始推理时触发。
 * 携带所使用的 model（模型）名称。
 */
export type ThinkingStartedEvent = StreamEventBase & {
  type: "stream.thinking_started";
  payload: { model: string };
};

/**
 * 思考内容片段事件——LLM 推理过程中的增量输出。
 * content 为推理过程的部分文本。
 */
export type ThinkingChunkEvent = StreamEventBase & {
  type: "stream.thinking_chunk";
  payload: { content: string };
};

/**
 * 工具调用开始事件——工具开始执行时触发。
 * 携带 toolName（工具名）、toolCallId（工具调用标识）和 args（参数）。
 */
export type ToolCallStartedEvent = StreamEventBase & {
  type: "stream.tool_call_started";
  payload: { toolName: string; toolCallId: string; args: unknown };
};

/**
 * 工具调用完成事件——工具执行完毕时触发。
 * 携带执行结果 result 和成功标志 success。
 */
export type ToolCallCompletedEvent = StreamEventBase & {
  type: "stream.tool_call_completed";
  payload: { toolName: string; toolCallId: string; result: unknown; success: boolean };
};

/**
 * 文本内容片段事件——LLM 输出的增量文本。
 * index 用于标识同一轮中多个文本输出的顺序。
 */
export type TextChunkEvent = StreamEventBase & {
  type: "stream.text_chunk";
  payload: { content: string; index: number };
};

/**
 * 流式完成事件——整个流式输出结束时触发。
 * status 描述最终状态：completed（完成）/ failed（失败）/ interrupted（中断）。
 */
export type StreamDoneEvent = StreamEventBase & {
  type: "stream.done";
  payload: { summary: string; status: "completed" | "failed" | "interrupted" };
};

/** 流式事件联合类型——所有可能的 StreamEvent 子类型 */
export type StreamEvent =
  | ThinkingStartedEvent
  | ThinkingChunkEvent
  | ToolCallStartedEvent
  | ToolCallCompletedEvent
  | TextChunkEvent
  | StreamDoneEvent;

/**
 * 判断给定类型字符串是否为流式事件。
 * 所有 StreamEvent 类型以 "stream." 前缀标识。
 */
export function isStreamEvent(type: string): boolean {
  return type.startsWith("stream.");
}
