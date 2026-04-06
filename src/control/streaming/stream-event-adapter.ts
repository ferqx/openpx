import type { CompiledStateGraph } from "@langchain/langgraph";
import type { StreamEvent as LangGraphStreamEvent } from "@langchain/core/tracers/log_stream";
import type { StreamEvent } from "../../domain/stream-events";
import { ulid } from "ulid";

const TEXT_CHUNK_TIME_MS = 100;
const TEXT_CHUNK_SIZE = 200;

export interface StreamEventAdapterInput {
  graph: any;
  graphInput: Record<string, unknown>;
  config: Record<string, unknown>;
  threadId: string;
  taskId: string;
  turnId: string;
}

export async function* streamEventsAdapter(input: StreamEventAdapterInput): AsyncGenerator<StreamEvent, StreamEvent, void> {
  const { graph, graphInput, config, threadId, taskId, turnId } = input;
  let seq = 0;
  let textIndex = 0;
  let textBuffer = "";
  let lastEmitTime = Date.now();
  let accumulatedText = "";
  let modelName = "unknown";

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

  function shouldEmitText(): boolean {
    const elapsed = Date.now() - lastEmitTime;
    return elapsed >= TEXT_CHUNK_TIME_MS || textBuffer.length >= TEXT_CHUNK_SIZE;
  }

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

  const stream = graph.streamEvents(graphInput, {
    ...config,
    version: "v2",
  } as any);

  for await (const event of stream as AsyncIterable<LangGraphStreamEvent>) {
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
        const chunk = data?.chunk;
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
            if (textEvent) yield textEvent;
          }
        }
        break;
      }

      case "on_chat_model_end": {
        const textEvent = emitBufferedText();
        if (textEvent) yield textEvent;
        break;
      }

      case "on_tool_start": {
        const toolName = name ?? "unknown";
        const toolCallId = (data?.input?.id ?? data?.input?.tool_call_id ?? "") as string;
        const args = data?.input ?? data?.input?.args ?? {};
        yield {
          ...makeBase(),
          type: "stream.tool_call_started",
          payload: { toolName, toolCallId, args },
        };
        break;
      }

      case "on_tool_end": {
        const toolName = name ?? "unknown";
        const toolCallId = (data?.output?.tool_call_id ?? "") as string;
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
  if (finalTextEvent) yield finalTextEvent;
  accumulatedText += textBuffer;

  const doneEvent: StreamEvent = {
    ...makeBase(),
    type: "stream.done",
    payload: { summary: accumulatedText, status: "completed" },
  };
  yield doneEvent;
  return doneEvent;
}
