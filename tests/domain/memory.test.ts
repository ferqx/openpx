import { describe, expect, test } from "bun:test";
import { createMemoryRecord } from "../../src/domain/memory";

describe("memory records", () => {
  test("does not synthesize createdAt", () => {
    const memory = createMemoryRecord({
      memoryId: "memory_1",
      namespace: "thread",
      key: "summary",
      value: "keep it short",
      threadId: "thread_1",
    } as any);

    expect(memory.memoryId).toBe("memory_1");
    expect(memory.namespace).toBe("thread");
    expect(memory.createdAt).toBeUndefined();
  });
});
