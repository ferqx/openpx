type StreamEventBase = {
  eventId: string;
  threadId: string;
  taskId: string;
  turnId: string;
  seq: number;
  timestamp: string;
};

export type ThinkingStartedEvent = StreamEventBase & {
  type: "stream.thinking_started";
  payload: { model: string };
};

export type ThinkingChunkEvent = StreamEventBase & {
  type: "stream.thinking_chunk";
  payload: { content: string };
};

export type ToolCallStartedEvent = StreamEventBase & {
  type: "stream.tool_call_started";
  payload: { toolName: string; toolCallId: string; args: unknown };
};

export type ToolCallCompletedEvent = StreamEventBase & {
  type: "stream.tool_call_completed";
  payload: { toolName: string; toolCallId: string; result: unknown; success: boolean };
};

export type TextChunkEvent = StreamEventBase & {
  type: "stream.text_chunk";
  payload: { content: string; index: number };
};

export type StreamDoneEvent = StreamEventBase & {
  type: "stream.done";
  payload: { summary: string; status: "completed" | "failed" | "interrupted" };
};

export type StreamEvent =
  | ThinkingStartedEvent
  | ThinkingChunkEvent
  | ToolCallStartedEvent
  | ToolCallCompletedEvent
  | TextChunkEvent
  | StreamDoneEvent;

export function isStreamEvent(type: string): boolean {
  return type.startsWith("stream.");
}
