import type { Event } from "../../domain/event";
import { PROTOCOL_VERSION, type RuntimeEventEnvelope } from "./runtime-types";

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
  return {
    protocolVersion: PROTOCOL_VERSION,
    seq: input.seq,
    timestamp: input.timestamp ?? new Date().toISOString(),
    traceId: input.traceId ?? crypto.randomUUID(),
    event: input.event,
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
