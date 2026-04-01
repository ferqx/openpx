export type Event = {
  eventId: string;
  threadId: string;
  taskId?: string;
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
    eventId: input.eventId,
    threadId: input.threadId,
    taskId: input.taskId,
    type: input.type,
    payload: input.payload,
    createdAt: input.createdAt,
  };
}
