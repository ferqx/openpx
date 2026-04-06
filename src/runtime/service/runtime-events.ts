import type { Event } from "../../domain/event";
import { PROTOCOL_VERSION, type RuntimeEventEnvelope } from "./runtime-types";
import { isRuntimeEventType, runtimeEventSchema } from "./protocol/runtime-event-schema";

export function getStoredEventSequence(event?: Event): number | undefined {
  if (!event) {
    return undefined;
  }

  return (event as Event & { sequence?: number }).sequence;
}

export function createRuntimeEventEnvelope(input: {
  seq: number;
  event: Event | { type: string; payload?: unknown };
  timestamp?: string;
  traceId?: string;
}): RuntimeEventEnvelope {
  if (!isRuntimeEventType(input.event.type)) {
    throw new Error(`Unknown runtime event type: ${input.event.type}`);
  }

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
