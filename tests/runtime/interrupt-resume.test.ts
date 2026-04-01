import { describe, expect, test } from "bun:test";
import { Command, INTERRUPT, isInterrupted } from "@langchain/langgraph";
import { createRootGraph } from "../../src/runtime/graph/root/graph";

describe("root graph interrupt/resume", () => {
  test("interrupts after execution and resumes to done", async () => {
    const graph = await createRootGraph({
      planner: async () => ({ summary: "planned", mode: "plan" }),
      executor: async () => ({ summary: "executed", mode: "execute" }),
      verifier: async () => ({ summary: "verified", mode: "verify" }),
    });

    const interrupted = await graph.invoke(
      { input: "execute the patch" },
      { configurable: { thread_id: "thread_interrupt" } },
    );

    expect(isInterrupted(interrupted)).toBe(true);
    if (!isInterrupted(interrupted)) {
      throw new Error("Expected graph interrupt");
    }

    expect(interrupted[INTERRUPT][0]?.value).toEqual({
      kind: "post-turn-review",
      mode: "execute",
      summary: "executed",
    });

    const resumed = await graph.invoke(
      new Command({ resume: "approved" }),
      { configurable: { thread_id: "thread_interrupt" } },
    );

    expect(resumed.mode).toBe("done");
    expect(resumed.summary).toBe("executed");
  });
});
