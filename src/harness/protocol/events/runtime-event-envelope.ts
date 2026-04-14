import type { Event } from "../../../domain/event";
import type { RuntimeEventEnvelope } from "../schemas/api-schema";
import { CURRENT_PROTOCOL_VERSION as PROTOCOL_VERSION } from "../schemas/protocol-version";
import { isRuntimeEventType, runtimeEventSchema } from "./runtime-event-schema";

/** 读取持久事件的 sequence 字段；旧事件不存在时返回 undefined */
export function getStoredEventSequence(event?: Event): number | undefined {
  if (!event) {
    return undefined;
  }

  return (event as Event & { sequence?: number }).sequence;
}

/** 创建 runtime 事件信封：补齐协议版本、序号、traceId 与 payload 校验 */
export function createRuntimeEventEnvelope(input: {
  seq: number;
  event: Event | { type: string; payload?: unknown };
  timestamp?: string;
  traceId?: string;
}): RuntimeEventEnvelope {
  if (!isRuntimeEventType(input.event.type)) {
    throw new Error(`Unknown runtime event type: ${input.event.type}`);
  }

  // 所有对外 runtime event 都必须过一遍 schema，防止内部 event 直接泄漏成不稳定协议。
  const parsedEvent = runtimeEventSchema.safeParse({
    type: input.event.type,
    payload: input.event.payload,
  });

  if (!parsedEvent.success) {
    const issue = parsedEvent.error.issues[0];
    const detail = issue ? `${issue.path.join(".")}: ${issue.message}` : "payload did not match schema";
    throw new Error(`Invalid runtime event payload for ${input.event.type}: ${detail}`);
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    seq: input.seq,
    timestamp: input.timestamp ?? new Date().toISOString(),
    traceId: input.traceId ?? crypto.randomUUID(),
    event: parsedEvent.data,
  };
}

/** 把持久化事件映射成 runtime 协议事件；缺失 sequence 时使用 fallback 补序 */
export function mapStoredEventToEnvelope(input: {
  event: Event;
  fallbackSeq: number;
}): RuntimeEventEnvelope {
  return createRuntimeEventEnvelope({
    seq: getStoredEventSequence(input.event) ?? input.fallbackSeq,
    event: input.event,
    timestamp: input.event.createdAt,
    traceId: input.event.eventId,
  });
}
