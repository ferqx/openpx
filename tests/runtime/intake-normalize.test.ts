import { describe, expect, test } from "bun:test";
import { MemorySaver } from "@langchain/langgraph";
import { createRootGraph } from "../../src/runtime/graph/root/graph";
import { intakeNormalizeNode } from "../../src/runtime/graph/root/nodes/intake-normalize";

describe("intake normalize node", () => {
  test("derives a minimal normalized intake payload for code-change requests", () => {
    const result = intakeNormalizeNode({ input: "  Fix startup message  " });

    expect(result).toEqual({
      normalizedInput: {
        goal: "Fix startup message",
        constraints: [],
        successCriteria: ["startup message updated"],
        riskLevel: "low",
        requiresCodeChange: true,
        requiresExternalAction: false,
      },
    });
  });

  test("feeds the trimmed goal into the root graph intake pipeline", async () => {
    const checkpointer = new MemorySaver();
    let plannerCallInput: string | undefined;

    const graph = await createRootGraph({
      checkpointer,
      planner: async (input) => {
        plannerCallInput = input.input;
        return { summary: "planned", mode: "plan" };
      },
      executor: async () => ({ summary: "executed", mode: "execute" }),
      verifier: async () => ({ summary: "verified", mode: "verify" }),
    });

    const result = await graph.invoke(
      { input: "   plan Fix startup message   " },
      { configurable: { thread_id: "thread_intake", task_id: "task_intake" } },
    );

    expect(result.mode).toBe("plan");
    expect(plannerCallInput).toBe("plan Fix startup message");
  });
});
