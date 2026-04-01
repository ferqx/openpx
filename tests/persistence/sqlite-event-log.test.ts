import { describe, expect, test } from "bun:test";
import { SqliteEventLog } from "../../src/persistence/sqlite/sqlite-event-log";

describe("SqliteEventLog", () => {
  test("appends and lists thread events in insertion order", async () => {
    const log = new SqliteEventLog(":memory:");

    await log.append({ eventId: "event_1", threadId: "thread_1", type: "task.started" });
    await log.append({ eventId: "event_2", threadId: "thread_1", type: "task.completed", payload: { ok: true } });
    await log.append({ eventId: "event_3", threadId: "thread_2", type: "task.started" });

    const events = await log.listByThread("thread_1");

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.eventId)).toEqual(["event_1", "event_2"]);
    expect(events[1]?.payload).toEqual({ ok: true });
  });
});
