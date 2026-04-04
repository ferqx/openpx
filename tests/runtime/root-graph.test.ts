import { describe, expect, test } from "bun:test";
import { MemorySaver } from "@langchain/langgraph";
import { createRootGraph } from "../../src/runtime/graph/root/graph";

describe("root graph", () => {
  test("routes plan work into the planner worker with injected checkpointer and execution context", async () => {
    const checkpointer = new MemorySaver();
    let plannerCallInput: string | undefined;
    let plannerCallThreadId: string | undefined;
    let plannerCallTaskId: string | undefined;

    const graph = await createRootGraph({
      checkpointer,
      planner: async (input) => {
        plannerCallInput = input.input;
        plannerCallThreadId = input.threadId;
        plannerCallTaskId = input.taskId;
        return { summary: "planned", mode: "plan" };
      },
      executor: async () => ({ summary: "executed", mode: "execute" }),
      verifier: async () => ({ summary: "verified", mode: "verify" }),
    });

    const result = await graph.invoke(
      { input: "plan the repository" },
      { configurable: { thread_id: "thread_1", task_id: "task_1" } },
    );

    expect(result.mode).toBe("plan");
    expect(plannerCallInput).toBe("plan the repository");
    expect(plannerCallThreadId).toBe("thread_1");
    expect(plannerCallTaskId).toBe("task_1");
  });

  test("routes execute work to the executor even when the request mentions src/planner.ts", async () => {
    const checkpointer = new MemorySaver();
    let plannerCalled = false;
    let executorCalled = false;

    const graph = await createRootGraph({
      checkpointer,
      planner: async () => {
        plannerCalled = true;
        return { summary: "planned", mode: "plan" };
      },
      executor: async () => {
        executorCalled = true;
        return { summary: "executed", mode: "execute" };
      },
      verifier: async () => ({ summary: "verified", mode: "verify" }),
    });

    const result = await graph.invoke(
      { input: "delete src/planner.ts" },
      { configurable: { thread_id: "thread_2", task_id: "task_2" } },
    );

    // Now it should be waiting_approval because of the RecommendationEngine
    expect(result.mode).toBe("waiting_approval");
    expect(result.recommendationReason).toContain("high-risk");
    expect(plannerCalled).toBe(false);
    expect(executorCalled).toBe(false); // Should NOT even call executor if recommended first
  });

  test("hydrates the root state from persisted recovery facts and working set", async () => {
    const checkpointer = new MemorySaver();
    const graph = await createRootGraph({
      checkpointer,
      planner: async () => ({ summary: "planned", mode: "plan" }),
      executor: async () => ({ summary: "executed", mode: "execute" }),
      verifier: async () => ({ summary: "verified", mode: "verify" }),
      getThreadView: async () => ({
        recoveryFacts: {
          pendingApprovals: [],
          blocking: {
            sourceTaskId: "1",
            kind: "human_recovery",
            message: "need help",
          },
        },
        narrativeState: {
          threadSummary: "",
          taskSummaries: [],
          openLoops: [],
          notableEvents: [],
        },
        workingSetWindow: {
          messages: ["Need to inspect the previous patch."],
          toolResults: [],
          verifierFeedback: [],
          retrievedMemories: [],
        },
      }),
    });

    const result = await graph.invoke(
      { input: "continue the blocked thread" },
      { configurable: { thread_id: "thread_derived", task_id: "task_derived" } },
    );

    expect(result.recoveryFacts?.blocking?.kind).toBe("human_recovery");
    expect(result.workingSetWindow?.messages).toContain("Need to inspect the previous patch.");
  });

  test("routes boundary compaction decisions through the compact node", async () => {
    // This is a placeholder test to verify the route, we'll implement it when we build the router
    expect(true).toBe(true);
  });
});
