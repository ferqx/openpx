import { eventId as sharedEventId, taskId as sharedTaskId, threadId as sharedThreadId } from "../shared/ids";

export const durableEventTypes = [
  "task.created",
  "task.started",
  "task.updated",
  "task.completed",
  "task.failed",
  "thread.blocked",
  "thread.view_updated",
  "tool.executed",
  "tool.failed",
] as const;

export type DurableEventType = (typeof durableEventTypes)[number];

function isDurableEventType(value: string): value is DurableEventType {
  return (durableEventTypes as readonly string[]).includes(value);
}

export type Event = {
  eventId: ReturnType<typeof sharedEventId>;
  threadId: ReturnType<typeof sharedThreadId>;
  taskId?: ReturnType<typeof sharedTaskId>;
  type: DurableEventType;
  payload?: Record<string, unknown>;
  createdAt?: string;
};

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
