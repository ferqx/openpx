import { describe, expect, test } from "bun:test";
import { createRootGraph } from "../../src/runtime/graph/root/graph";

describe("root graph", () => {
  test("routes plan work into the planner worker", async () => {
    const graph = await createRootGraph({
      planner: async () => ({ summary: "planned", mode: "plan" }),
      executor: async () => ({ summary: "executed", mode: "execute" }),
      verifier: async () => ({ summary: "verified", mode: "verify" }),
    });

    const result = await graph.invoke(
      { input: "plan the repository" },
      { configurable: { thread_id: "thread_1" } },
    );

    expect(result.mode).toBe("plan");
    expect(result.summary).toBe("planned");
  });
});
