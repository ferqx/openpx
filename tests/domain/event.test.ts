import { describe, expect, test } from "bun:test";
import { createEvent } from "../../src/domain/event";

describe("events", () => {
  test("does not synthesize payload or createdAt", () => {
    const event = createEvent({
      eventId: "event_1",
      threadId: "thread_1",
      type: "task.started",
    });

    expect(event.eventId).toBe("event_1");
    expect(event.threadId).toBe("thread_1");
    expect(event.type).toBe("task.started");
    expect(event.payload).toBeUndefined();
    expect(event.createdAt).toBeUndefined();
  });

  test("rejects non-durable runtime-only event types", () => {
    expect(() =>
      createEvent({
        eventId: "event_2",
        threadId: "thread_1",
        type: "stream.text_chunk",
        payload: { content: "hello", index: 0 },
      }),
    ).toThrow("Unsupported durable event type: stream.text_chunk");
  });
});
