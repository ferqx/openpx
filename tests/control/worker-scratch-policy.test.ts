import { describe, expect, test } from "bun:test";
import { createWorkerScratchPolicy } from "../../src/control/context/worker-scratch-policy";

describe("WorkerScratchPolicy", () => {
  test("marks worker scratch as non-durable by default", () => {
    const policy = createWorkerScratchPolicy();
    const entry = {
      kind: "scratch",
      content: "Temporary research note",
      timestamp: Date.now(),
    };

    expect(policy.shouldPersist(entry)).toBe(false);
  });

  test("allows persistence only if explicitly marked for promotion", () => {
    const policy = createWorkerScratchPolicy();
    const scratchEntry = {
      kind: "scratch",
      content: "Hidden internal detail",
    };
    const stableEntry = {
      kind: "stable_output",
      content: "Curated result",
    };

    expect(policy.shouldPersist(scratchEntry)).toBe(false);
    expect(policy.shouldPersist(stableEntry)).toBe(true);
  });
});
