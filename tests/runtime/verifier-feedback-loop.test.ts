import { describe, expect, test } from "bun:test";
import { MemorySaver, Command, isInterrupted } from "@langchain/langgraph";
import { createRootGraph } from "../../src/runtime/graph/root/graph";

describe("verifier feedback loop", () => {
  test("routes back to executor when verifier fails", async () => {
    const checkpointer = new MemorySaver();
    let executorCalls = 0;
    let verifierCalls = 0;

    const graph = await createRootGraph({
      checkpointer,
      planner: async (input) => {
        return { summary: "planned", mode: "plan" };
      },
      executor: async (input) => {
        executorCalls++;
        if (executorCalls === 1) {
          expect(input.input).toContain("missing tests");
        }
        return { 
          summary: "executor fixed it. now verify it.", 
          mode: "execute",
        };
      },
      verifier: async (input) => {
        verifierCalls++;
        if (verifierCalls === 1) {
          return { 
            summary: "missing tests", 
            mode: "verify",
            isValid: false,
            feedback: "missing tests"
          } as any;
        }
        return { 
            summary: "verified", 
            mode: "verify",
            isValid: true 
        } as any;
      },
    });

    const config = { configurable: { thread_id: "thread_3", task_id: "task_3" } };
    
    // 1. First run: intake -> route -> verifier (fail) -> route -> executor -> post-turn-guard (interrupt)
    let result = await graph.invoke({ input: "verify the repository" }, config);
    expect(isInterrupted(result)).toBe(true);
    expect(verifierCalls).toBe(1);
    expect(executorCalls).toBe(1);

    // 2. Resume from interrupt: post-turn-guard -> intake (resume with 'verify') -> route -> verifier (pass) -> END
    result = await graph.invoke(new Command({ resume: "verify" }), config);
    
    expect(verifierCalls).toBe(2);
    expect(executorCalls).toBe(1);
    expect(result.verifierPassed).toBe(true);
  });
});
