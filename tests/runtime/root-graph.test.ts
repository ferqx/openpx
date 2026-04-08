import { describe, expect, test } from "bun:test";
import { MemorySaver } from "@langchain/langgraph";
import { createRootGraph } from "../../src/runtime/graph/root/graph";

const startupMessageWorkPackage = {
  id: "pkg_startup_message",
  objective: "Update startup message",
  allowedTools: ["read_file", "apply_patch"],
  inputRefs: ["thread:goal", "file:src/app/main.ts"],
  expectedArtifacts: ["patch:src/app/main.ts"],
};

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
    expect(result.route).toBe("planner");
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

  test("continues from planner output into execution when the planner emits work packages", async () => {
    const checkpointer = new MemorySaver();
    let plannerCalled = false;
    let executorCalled = false;

    const graph = await createRootGraph({
      checkpointer,
      planner: async () => {
        plannerCalled = true;
        return {
          summary: "planned startup message update",
          mode: "plan",
          workPackages: [startupMessageWorkPackage],
        };
      },
      executor: async () => {
        executorCalled = true;
        return { summary: "executed startup message update", mode: "execute" };
      },
      verifier: async () => ({ summary: "verified", mode: "verify" }),
    });

    const result = await graph.invoke(
      { input: "fix the startup message" },
      { configurable: { thread_id: "thread_plan_exec", task_id: "task_plan_exec" } },
    );

    expect(plannerCalled).toBe(true);
    expect(executorCalled).toBe(true);
    expect(result.workPackages).toEqual([startupMessageWorkPackage]);
    expect(result.currentWorkPackageId).toBe("pkg_startup_message");
    expect(result.summary).toBe("executed startup message update");
  });

  test("commits executor-produced latest artifacts after a follow-up verification turn", async () => {
    const checkpointer = new MemorySaver();
    const graph = await createRootGraph({
      checkpointer,
      planner: async () => ({
        summary: "planned startup message update",
        mode: "plan",
        workPackages: [startupMessageWorkPackage],
      }),
      executor: async () => ({
        summary: "executed startup message update",
        mode: "execute",
        latestArtifacts: [
          {
            ref: "patch:src/app/main.ts",
            kind: "patch",
            summary: "Updated startup message copy",
            workPackageId: "pkg_startup_message",
          },
        ],
      }),
      verifier: async () => ({ summary: "verified", mode: "verify", isValid: true }),
    });

    const first = await graph.invoke(
      {
        input: "continue",
        workPackages: [startupMessageWorkPackage],
        currentWorkPackageId: "pkg_startup_message",
      },
      { configurable: { thread_id: "thread_artifact_commit", task_id: "task_artifact_commit" } },
    );

    expect(first.artifacts).toEqual([]);
    expect(first.latestArtifacts).toEqual([
      {
        ref: "patch:src/app/main.ts",
        kind: "patch",
        summary: "Updated startup message copy",
        workPackageId: "pkg_startup_message",
      },
    ]);

    const second = await graph.invoke(
      { input: "continue" },
      { configurable: { thread_id: "thread_artifact_commit", task_id: "task_artifact_commit" } },
    );

    expect(second.artifacts).toEqual([
      {
        ref: "patch:src/app/main.ts",
        kind: "patch",
        summary: "Updated startup message copy",
        workPackageId: "pkg_startup_message",
      },
    ]);
    expect(second.latestArtifacts).toEqual([]);
    expect(second.finalAnswer).toBe("verified");
  });

  test("passes active work package context into executor and verifier", async () => {
    const checkpointer = new MemorySaver();
    let executorInput:
      | {
          currentWorkPackage?: typeof startupMessageWorkPackage;
          plannerResult?: {
            verificationScope?: string[];
          };
        }
      | undefined;
    let verifierInput:
      | {
          currentWorkPackage?: typeof startupMessageWorkPackage;
          artifacts?: Array<{ ref: string }>;
        }
      | undefined;

    const graph = await createRootGraph({
      checkpointer,
      planner: async () => ({
        summary: "planned startup message update",
        mode: "plan",
        workPackages: [startupMessageWorkPackage],
        plannerResult: {
          workPackages: [startupMessageWorkPackage],
          acceptanceCriteria: ["startup message updated"],
          riskFlags: [],
          approvalRequiredActions: [],
          verificationScope: ["tests/runtime/intake-normalize.test.ts"],
        },
      }),
      executor: async (input) => {
        executorInput = input as typeof executorInput;
        return { summary: "executed startup message update", mode: "execute" };
      },
      verifier: async (input) => {
        verifierInput = input as typeof verifierInput;
        return { summary: "verified", mode: "verify", isValid: true };
      },
    });

    await graph.invoke(
      { input: "fix the startup message" },
      { configurable: { thread_id: "thread_context_exec", task_id: "task_context_exec" } },
    );

    expect(executorInput?.currentWorkPackage?.id).toBe("pkg_startup_message");
    expect(executorInput?.plannerResult?.verificationScope).toEqual([
      "tests/runtime/intake-normalize.test.ts",
    ]);

    await graph.invoke(
      {
        input: "verify",
        workPackages: [startupMessageWorkPackage],
        currentWorkPackageId: "pkg_startup_message",
        artifacts: [
          {
            ref: "patch:src/app/main.ts",
            kind: "patch",
            summary: "Updated startup message copy",
            workPackageId: "pkg_startup_message",
          },
        ],
      },
      { configurable: { thread_id: "thread_context_verify", task_id: "task_context_verify" } },
    );

    expect(verifierInput?.currentWorkPackage?.id).toBe("pkg_startup_message");
    expect(verifierInput?.artifacts?.[0]?.ref).toBe("patch:src/app/main.ts");
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

  test("routes to the executor when the active work package has not been executed yet", async () => {
    const checkpointer = new MemorySaver();
    let executorCalled = false;
    let plannerCalled = false;
    let verifierCalled = false;

    const graph = await createRootGraph({
      checkpointer,
      planner: async () => {
        plannerCalled = true;
        return { summary: "planned", mode: "plan" };
      },
      executor: async () => {
        executorCalled = true;
        return { summary: "executed pwd", mode: "execute" };
      },
      verifier: async () => {
        verifierCalled = true;
        return { summary: "verified", mode: "verify" };
      },
    });

    const result = await graph.invoke(
      { input: "continue", workPackages: [startupMessageWorkPackage] },
      { configurable: { thread_id: "thread_exec", task_id: "task_exec" } },
    );

    expect(executorCalled).toBe(true);
    expect(plannerCalled).toBe(false);
    expect(verifierCalled).toBe(false);
    expect(result.mode).toBe("done");
    expect(result.summary).toBe("executed pwd");
    expect(result.currentWorkPackageId).toBe("pkg_startup_message");
  });

  test("commits and finishes after verifier passes for the active work package", async () => {
    const checkpointer = new MemorySaver();
    let verifierCalled = false;
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
      verifier: async () => {
        verifierCalled = true;
        return { summary: "verified", mode: "verify" };
      },
    });

    const result = await graph.invoke(
      {
        input: "continue",
        workPackages: [startupMessageWorkPackage],
        currentWorkPackageId: "pkg_startup_message",
        artifacts: [
          {
            ref: "patch:src/app/main.ts",
            kind: "patch",
            summary: "Updated startup message copy",
            workPackageId: "pkg_startup_message",
          },
        ],
      },
      { configurable: { thread_id: "thread_verify", task_id: "task_verify" } },
    );

    expect(verifierCalled).toBe(true);
    expect(plannerCalled).toBe(false);
    expect(executorCalled).toBe(false);
    expect(result.mode).toBe("done");
    expect(result.summary).toBe("verified");
    expect(result.route).toBe("finish");
    expect(result.currentWorkPackageId).toBeUndefined();
  });

  test("finishes immediately after verification already passed for all work packages", async () => {
    const checkpointer = new MemorySaver();
    let executorCalled = false;
    let plannerCalled = false;
    let verifierCalled = false;

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
      verifier: async () => {
        verifierCalled = true;
        return { summary: "verified", mode: "verify" };
      },
    });

    const result = await graph.invoke(
      {
        input: "continue",
        workPackages: [startupMessageWorkPackage],
        currentWorkPackageId: "pkg_startup_message",
        artifacts: [
          {
            ref: "patch:src/app/main.ts",
            kind: "patch",
            summary: "Updated startup message copy",
            workPackageId: "pkg_startup_message",
          },
        ],
        verificationReport: {
          summary: "All checks passed",
          passed: true,
        },
      },
      { configurable: { thread_id: "thread_finish", task_id: "task_finish" } },
    );

    expect(executorCalled).toBe(false);
    expect(plannerCalled).toBe(false);
    expect(verifierCalled).toBe(false);
    expect(result.mode).toBe("done");
    expect(result.route).toBe("finish");
  });
});
