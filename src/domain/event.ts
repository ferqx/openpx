import { eventId as sharedEventId, taskId as sharedTaskId, threadId as sharedThreadId } from "../shared/ids";

export type Event = {
  eventId: ReturnType<typeof sharedEventId>;
  threadId: ReturnType<typeof sharedThreadId>;
  taskId?: ReturnType<typeof sharedTaskId>;
  type: string;
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
  return {
    eventId: sharedEventId(input.eventId),
    threadId: sharedThreadId(input.threadId),
    taskId: input.taskId ? sharedTaskId(input.taskId) : undefined,
    type: input.type,
    payload: input.payload,
    createdAt: input.createdAt,
  };
}
