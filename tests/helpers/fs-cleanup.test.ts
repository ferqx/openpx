import { describe, expect, test } from "bun:test";
import { removeWithRetry } from "./fs-cleanup";

describe("removeWithRetry", () => {
  test("对瞬时 EBUSY 错误进行重试后成功", async () => {
    const calls: string[] = [];
    const sleepCalls: number[] = [];
    let attempts = 0;

    await removeWithRetry("demo-path", {
      recursive: true,
      force: true,
      retries: 4,
      delayMs: 5,
      remove: async () => {
        calls.push(`attempt:${attempts}`);
        attempts += 1;
        if (attempts < 3) {
          const error = new Error("busy");
          (error as Error & { code?: string }).code = "EBUSY";
          throw error;
        }
      },
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
    });

    expect(calls).toHaveLength(3);
    expect(sleepCalls).toEqual([5, 5]);
  });

  test("对 ENOTEMPTY 也会执行重试", async () => {
    let attempts = 0;
    const sleepCalls: number[] = [];

    await removeWithRetry("demo-path", {
      retries: 2,
      delayMs: 7,
      remove: async () => {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error("not empty");
          (error as Error & { code?: string }).code = "ENOTEMPTY";
          throw error;
        }
      },
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
    });

    expect(attempts).toBe(2);
    expect(sleepCalls).toEqual([7]);
  });

  test("对非瞬时错误直接抛出，不进行额外重试", async () => {
    let attempts = 0;
    const error = new Error("missing");
    (error as Error & { code?: string }).code = "ENOENT";

    await expect(
      removeWithRetry("demo-path", {
        retries: 5,
        remove: async () => {
          attempts += 1;
          throw error;
        },
        sleep: async () => undefined,
      }),
    ).rejects.toBe(error);

    expect(attempts).toBe(1);
  });
});
