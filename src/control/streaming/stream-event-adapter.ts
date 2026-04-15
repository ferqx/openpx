import type { StreamEvent } from "../../domain/stream-events";
import { ulid } from "ulid";

const TEXT_CHUNK_TIME_MS = 100;
const TEXT_CHUNK_SIZE = 200;

/** 最小流式事件形状：当前适配器只依赖 event/data/name 三个字段。 */
type ModelStreamEvent = {
  event?: string;
  data?: Record<string, unknown>;
  name?: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

/** 当前适配器真正依赖的最小图接口：只要求能暴露 LangGraph streamEvents */
type StreamEventSourceGraph = {
  streamEvents(
    graphInput: Record<string, unknown>,
    config: Record<string, unknown>,
  ): AsyncIterable<ModelStreamEvent>;
};

/** 流式事件适配器输入：把 LangGraph 事件流翻译成 OpenPX StreamEvent */
export interface StreamEventAdapterInput {
  graph: StreamEventSourceGraph;
  graphInput: Record<string, unknown>;
  config: Record<string, unknown>;
  threadId: string;
  taskId: string;
  turnId: string;
}

/** 适配 LangGraph streamEvents：统一转成 thinking/text/tool/done 事件 */
export async function* streamEventsAdapter(input: StreamEventAdapterInput): AsyncGenerator<StreamEvent, StreamEvent, void> {
  const { graph, graphInput, config, threadId, taskId, turnId } = input;
  let seq = 0;
  let textIndex = 0;
  let textBuffer = "";
  let lastEmitTime = Date.now();
  let accumulatedText = "";
  let modelName = "unknown";

  /** 创建通用事件头 */
  function makeBase(): Omit<StreamEvent, "type" | "payload"> {
    return {
      eventId: ulid(),
      threadId,
      taskId,
      turnId,
      seq: ++seq,
      timestamp: new Date().toISOString(),
    };
  }

  /** 是否应当把已积累文本切成一个 chunk 发出 */
  function shouldEmitText(): boolean {
    const elapsed = Date.now() - lastEmitTime;
    return elapsed >= TEXT_CHUNK_TIME_MS || textBuffer.length >= TEXT_CHUNK_SIZE;
  }

  /** 发出当前缓冲文本，并推进 chunk 索引 */
  function emitBufferedText(): StreamEvent | null {
    if (!textBuffer) return null;
    const content = textBuffer;
    textBuffer = "";
    lastEmitTime = Date.now();
    return {
      ...makeBase(),
      type: "stream.text_chunk",
      payload: { content, index: textIndex++ },
    };
  }

  function appendChunkContent(event: StreamEvent | null): void {
    if (event?.type === "stream.text_chunk") {
      accumulatedText += event.payload.content;
    }
  }

  const stream = graph.streamEvents(graphInput, {
    ...config,
    version: "v2",
  });

  for await (const event of stream as AsyncIterable<ModelStreamEvent>) {
    const { event: eventType, data, name } = event;

    switch (eventType) {
      case "on_chat_model_start":
        modelName = name ?? "unknown";
        yield {
          ...makeBase(),
          type: "stream.thinking_started",
          payload: { model: modelName },
        };
        break;

      case "on_chat_model_stream": {
        const chunk = asRecord(data?.chunk);
        if (chunk) {
          if (typeof chunk.content === "string") {
            textBuffer += chunk.content;
          } else if (Array.isArray(chunk.content)) {
            for (const part of chunk.content) {
              if (typeof part === "string") {
                textBuffer += part;
              } else if (part?.text) {
                textBuffer += part.text;
              }
            }
          }
          if (shouldEmitText()) {
            const textEvent = emitBufferedText();
            if (textEvent) {
              appendChunkContent(textEvent);
              yield textEvent;
            }
          }
        }
        break;
      }

      case "on_chat_model_end": {
        const textEvent = emitBufferedText();
        if (textEvent) {
          appendChunkContent(textEvent);
          yield textEvent;
        }
        break;
      }

      case "on_tool_start": {
        const toolName = name ?? "unknown";
        const toolInput = asRecord(data?.input);
        const toolCallId = String(toolInput?.id ?? toolInput?.tool_call_id ?? "");
        const args = asRecord(toolInput?.args) ?? toolInput ?? {};
        yield {
          ...makeBase(),
          type: "stream.tool_call_started",
          payload: { toolName, toolCallId, args },
        };
        break;
      }

      case "on_tool_end": {
        const toolName = name ?? "unknown";
        const toolOutput = asRecord(data?.output);
        const toolCallId = String(toolOutput?.tool_call_id ?? "");
        const result = data?.output ?? data?.chunk ?? {};
        yield {
          ...makeBase(),
          type: "stream.tool_call_completed",
          payload: { toolName, toolCallId, result, success: true },
        };
        break;
      }

      case "on_tool_error": {
        const toolName = name ?? "unknown";
        yield {
          ...makeBase(),
          type: "stream.tool_call_completed",
          payload: { toolName, toolCallId: "", result: null, success: false },
        };
        break;
      }
    }
  }

  const finalTextEvent = emitBufferedText();
  if (finalTextEvent) {
    appendChunkContent(finalTextEvent);
    yield finalTextEvent;
  }

  const doneEvent: StreamEvent = {
    ...makeBase(),
    type: "stream.done",
    payload: { summary: accumulatedText, status: "completed" },
  };
  yield doneEvent;
  return doneEvent;
}
