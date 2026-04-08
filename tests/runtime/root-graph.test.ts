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
    expect(result.route).toBe("unrouted");
    expect(result.workPackages).toEqual([]);
    expect(result.currentWorkPackageId).toBeUndefined();
    expect(result.pendingApproval).toBeUndefined();
    expect(result.approved).toBe(false);
    expect(result.artifacts).toEqual([]);
    expect(result.verificationReport).toBeUndefined();
    expect(result.finalAnswer).toBeUndefined();
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
          threadId: "thread_derived",
          revision: 1,
          schemaVersion: 1,
          status: "blocked",
          updatedAt: new Date().toISOString(),
          pendingApprovals: [],
          blocking: {
            sourceTaskId: "1",
            kind: "human_recovery",
            message: "need help",
          },
        },
        narrativeState: {
          revision: 1,
          updatedAt: new Date().toISOString(),
          threadSummary: "",
          taskSummaries: [],
          openLoops: [],
          notableEvents: [],
        },
        workingSetWindow: {
          revision: 1,
          updatedAt: new Date().toISOString(),
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

  test("routes conversational memory questions to the responder", async () => {
    const checkpointer = new MemorySaver();
    let responderCalled = false;

    const graph = await createRootGraph({
      checkpointer,
      planner: async () => ({ summary: "planned", mode: "plan" }),
      executor: async () => ({ summary: "executed", mode: "execute" }),
      verifier: async () => ({ summary: "verified", mode: "verify" }),
      responder: async () => {
        responderCalled = true;
        return { summary: "Your name is Alice.", mode: "respond" };
      },
    });

    const result = await graph.invoke(
      { input: "what is my name?" },
      { configurable: { thread_id: "thread_memory", task_id: "task_memory" } },
    );

    expect(responderCalled).toBe(true);
    expect(result.mode).toBe("done");
    expect(result.summary).toBe("Your name is Alice.");
  });

  test("routes direct execution requests to the executor", async () => {
    const checkpointer = new MemorySaver();
    let executorCalled = false;

    const graph = await createRootGraph({
      checkpointer,
      planner: async () => ({ summary: "planned", mode: "plan" }),
      executor: async () => {
        executorCalled = true;
        return { summary: "executed pwd", mode: "execute" };
      },
      verifier: async () => ({ summary: "verified", mode: "verify" }),
    });

    const result = await graph.invoke(
      { input: "run pwd in the workspace" },
      { configurable: { thread_id: "thread_exec", task_id: "task_exec" } },
    );

    expect(executorCalled).toBe(true);
    expect(result.mode).toBe("done");
    expect(result.summary).toBe("executed pwd");
  });

  test("routes file-specific questions to the executor for read-then-answer flows", async () => {
    const checkpointer = new MemorySaver();
    let executorCalled = false;
    let plannerCalled = false;

    const graph = await createRootGraph({
      checkpointer,
      planner: async () => {
        plannerCalled = true;
        return { summary: "planned", mode: "plan" };
      },
      executor: async () => {
        executorCalled = true;
        return { summary: "explained main.ts", mode: "execute" };
      },
      verifier: async () => ({ summary: "verified", mode: "verify" }),
    });

    const result = await graph.invoke(
      { input: "what does src/app/main.ts do?" },
      { configurable: { thread_id: "thread_file_question", task_id: "task_file_question" } },
    );

    expect(executorCalled).toBe(true);
    expect(plannerCalled).toBe(false);
    expect(result.mode).toBe("done");
    expect(result.summary).toBe("explained main.ts");
  });

  test("routes file-specific fix requests to the executor even without leading action keywords", async () => {
    const checkpointer = new MemorySaver();
    let executorCalled = false;
    let plannerCalled = false;

    const graph = await createRootGraph({
      checkpointer,
      planner: async () => {
        plannerCalled = true;
        return { summary: "planned", mode: "plan" };
      },
      executor: async () => {
        executorCalled = true;
        return { summary: "fixed main.ts", mode: "execute" };
      },
      verifier: async () => ({ summary: "verified", mode: "verify" }),
    });

    const result = await graph.invoke(
      { input: "can you fix src/app/main.ts so the startup message is clearer?" },
      { configurable: { thread_id: "thread_file_fix", task_id: "task_file_fix" } },
    );

    expect(executorCalled).toBe(true);
    expect(plannerCalled).toBe(false);
    expect(result.mode).toBe("done");
    expect(result.summary).toBe("fixed main.ts");
  });
});
