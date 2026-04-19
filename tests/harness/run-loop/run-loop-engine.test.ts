import { describe, expect, test } from "bun:test";
import { createRunLoopEngine } from "../../../src/harness/core/run-loop/run-loop-engine";
import type { RunSuspension } from "../../../src/harness/core/run-loop/approval-suspension";
import type { RunStateStorePort } from "../../../src/persistence/ports/run-state-store";
import type { RunLoopState } from "../../../src/harness/core/run-loop/step-types";
import type { ContinuationEnvelope } from "../../../src/harness/core/run-loop/continuation";

function createMemoryRunStateStore(): RunStateStorePort & {
  states: Map<string, RunLoopState>;
  suspensions: Map<string, RunSuspension>;
  continuations: Map<string, ContinuationEnvelope>;
} {
  const states = new Map<string, RunLoopState>();
  const suspensions = new Map<string, RunSuspension>();
  const continuations = new Map<string, ContinuationEnvelope>();

  return {
    states,
    suspensions,
    continuations,
    async loadLatestByThread(threadId) {
      return [...states.values()].find((state) => state.threadId === threadId);
    },
    async loadByRun(runId) {
      return states.get(runId);
    },
    async loadActiveSuspensionByRun(runId) {
      return [...suspensions.values()].find((suspension) => suspension.runId === runId && suspension.status === "active");
    },
    async loadContinuation(continuationId) {
      return continuations.get(continuationId);
    },
    async saveState(state) {
      if (!state.runId) {
        throw new Error("runId is required");
      }
      states.set(state.runId, state);
    },
    async saveSuspension(suspension) {
      suspensions.set(suspension.suspensionId, suspension);
    },
    async saveContinuation(continuation) {
      continuations.set(continuation.continuationId, continuation);
    },
    async consumeContinuation(continuationId) {
      const continuation = continuations.get(continuationId);
      if (!continuation) {
        return undefined;
      }
      const consumed = { ...continuation, status: "consumed" as const };
      continuations.set(continuationId, consumed);
      return consumed;
    },
    async resolveSuspension({ suspensionId, continuationId }) {
      const suspension = suspensions.get(suspensionId);
      if (!suspension || suspension.status !== "active") {
        return false;
      }
      suspensions.set(suspensionId, {
        ...suspension,
        status: "resolved",
        resolvedAt: new Date().toISOString(),
        resolvedByContinuationId: continuationId,
      });
      return true;
    },
    async invalidateSuspension({ suspensionId, reason }) {
      const suspension = suspensions.get(suspensionId);
      if (!suspension || suspension.status !== "active") {
        return false;
      }
      suspensions.set(suspensionId, {
        ...suspension,
        status: "invalidated",
        invalidatedAt: new Date().toISOString(),
        invalidationReason: reason,
      });
      return true;
    },
    async invalidateContinuation({ continuationId, reason }) {
      const continuation = continuations.get(continuationId);
      if (!continuation || continuation.status !== "created") {
        return false;
      }
      continuations.set(continuationId, {
        ...continuation,
        status: "invalidated",
        invalidatedAt: new Date().toISOString(),
        invalidationReason: reason,
      });
      return true;
    },
    async applyApprovalContinuation({ continuation, expectedEngineVersion, expectedStateVersion }) {
      const existingContinuation = continuations.get(continuation.continuationId);
      const state = states.get(continuation.runId) ?? {
        stateVersion: expectedStateVersion,
        engineVersion: expectedEngineVersion,
        threadId: continuation.threadId,
        runId: continuation.runId,
        taskId: continuation.taskId,
        input: continuation.reason ?? "",
        nextStep:
          existingContinuation?.status === "consumed"
            ? "done"
            : "waiting_approval",
        artifacts: [],
        latestArtifacts: [],
      };
      if (
        state.stateVersion !== expectedStateVersion
        || state.engineVersion !== expectedEngineVersion
      ) {
        continuations.set(continuation.continuationId, {
          ...continuation,
          status: "invalidated",
          invalidatedAt: new Date().toISOString(),
          invalidationReason: "run-loop state version mismatch",
        });
        const activeSuspension = [...suspensions.values()].find(
          (suspension) => suspension.runId === continuation.runId && suspension.status === "active",
        );
        if (activeSuspension) {
          suspensions.set(activeSuspension.suspensionId, {
            ...activeSuspension,
            status: "invalidated",
            invalidatedAt: new Date().toISOString(),
            invalidationReason: "run-loop state version mismatch",
          });
        }
        return {
          disposition: "not_resumable" as const,
          state,
        };
      }

      if (existingContinuation?.status === "consumed") {
        return {
          disposition: "already_consumed" as const,
          state,
        };
      }
      if (existingContinuation?.status === "invalidated") {
        return {
          disposition: "invalidated" as const,
          state,
        };
      }

      continuations.set(continuation.continuationId, {
        ...continuation,
        status: "consumed",
        consumedAt: new Date().toISOString(),
      });

      const activeSuspension = [...suspensions.values()].find(
        (suspension) => suspension.runId === continuation.runId && suspension.status === "active",
      );
      if (!activeSuspension) {
        return {
          disposition: "already_resolved" as const,
          state,
        };
      }

      if (continuation.decision === "approved") {
        suspensions.set(activeSuspension.suspensionId, {
          ...activeSuspension,
          status: "resolved",
          resolvedAt: new Date().toISOString(),
          resolvedByContinuationId: continuation.continuationId,
        });
        const resumedState: RunLoopState = {
          ...state,
          nextStep: activeSuspension.resumeStep,
          pendingApproval: undefined,
          pauseSummary: undefined,
          approvedApprovalRequestId: continuation.approvalRequestId,
        };
        states.set(continuation.runId, resumedState);
        return {
          disposition: "resumed" as const,
          state: resumedState,
        };
      }

      suspensions.set(activeSuspension.suspensionId, {
        ...activeSuspension,
        status: "invalidated",
        invalidatedAt: new Date().toISOString(),
        invalidationReason: continuation.reason ?? "approval rejected",
      });
      const resumedState: RunLoopState = {
        ...state,
        input: continuation.reason ?? state.input,
        nextStep: "plan",
        pendingApproval: undefined,
        pauseSummary: undefined,
        approvedApprovalRequestId: undefined,
      };
      states.set(continuation.runId, resumedState);
      return {
        disposition: "resumed" as const,
        state: resumedState,
      };
    },
    async applyPlanDecisionContinuation({ continuation, expectedEngineVersion, expectedStateVersion }) {
      const state = states.get(continuation.runId) ?? {
        stateVersion: expectedStateVersion,
        engineVersion: expectedEngineVersion,
        threadId: continuation.threadId,
        runId: continuation.runId,
        taskId: continuation.taskId,
        input: continuation.input,
        nextStep: "waiting_plan_decision" as const,
        artifacts: [],
        latestArtifacts: [],
      };
      if (
        state.stateVersion !== expectedStateVersion
        || state.engineVersion !== expectedEngineVersion
      ) {
        return {
          disposition: "not_resumable" as const,
          state,
        };
      }

      const activeSuspension = [...suspensions.values()].find(
        (suspension) => suspension.runId === continuation.runId && suspension.status === "active",
      );
      if (!activeSuspension || activeSuspension.reasonKind !== "waiting_plan_decision") {
        return {
          disposition: "invalidated" as const,
          state,
          suspension: activeSuspension,
        };
      }

      const consumed = {
        ...continuation,
        status: "consumed" as const,
        consumedAt: new Date().toISOString(),
      };
      continuations.set(continuation.continuationId, consumed);
      const resolvedSuspension: RunSuspension = {
        ...activeSuspension,
        status: "resolved",
        resolvedAt: new Date().toISOString(),
        resolvedByContinuationId: continuation.continuationId,
      };
      suspensions.set(activeSuspension.suspensionId, resolvedSuspension);
      const resumedState: RunLoopState = {
        ...state,
        input: continuation.input,
        nextStep: "plan",
        planDecision: undefined,
        pauseSummary: undefined,
        recommendationReason: undefined,
      };
      states.set(continuation.runId, resumedState);
      return {
        disposition: "resumed" as const,
        state: resumedState,
        continuation: consumed,
        suspension: resolvedSuspension,
      };
    },
    async invalidateRunRecoveryArtifacts({ runId, reason }) {
      let suspensionsCount = 0;
      let continuationsCount = 0;
      for (const [suspensionId, suspension] of suspensions.entries()) {
        if (suspension.runId === runId && suspension.status === "active") {
          suspensions.set(suspensionId, {
            ...suspension,
            status: "invalidated",
            invalidatedAt: new Date().toISOString(),
            invalidationReason: reason,
          });
          suspensionsCount += 1;
        }
      }
      for (const [continuationId, continuation] of continuations.entries()) {
        if (continuation.runId === runId && continuation.status === "created") {
          continuations.set(continuationId, {
            ...continuation,
            status: "invalidated",
            invalidatedAt: new Date().toISOString(),
            invalidationReason: reason,
          });
          continuationsCount += 1;
        }
      }
      return { suspensions: suspensionsCount, continuations: continuationsCount };
    },
    async listSuspensionsByThread(threadId) {
      return [...suspensions.values()].filter((item) => item.threadId === threadId);
    },
    async resetThreadState(threadId) {
      for (const [runId, state] of states.entries()) {
        if (state.threadId === threadId) {
          states.delete(runId);
        }
      }
      for (const [suspensionId, suspension] of suspensions.entries()) {
        if ((suspension as { threadId: string }).threadId === threadId) {
          suspensions.delete(suspensionId);
        }
      }
    },
    async deleteActiveRunState(runId) {
      states.delete(runId);
    },
    async deleteExpiredAuditRecords() {
      return { suspensions: 0, continuations: 0 };
    },
  };
}

describe("run-loop engine", () => {
  test("完成 plan -> execute -> verify -> respond 主链路", async () => {
    const store = createMemoryRunStateStore();
    const engine = createRunLoopEngine({
      runStateStore: store,
      planner: async () => ({
        nextStep: "execute",
        plannerResult: {
          workPackages: [
            {
              id: "pkg_startup_message",
              objective: "Update startup message",
              allowedTools: ["apply_patch"],
              inputRefs: ["thread:goal"],
              expectedArtifacts: ["patch:src/app/main.ts"],
            },
          ],
          acceptanceCriteria: ["startup message updated"],
          riskFlags: [],
          approvalRequiredActions: [],
          verificationScope: ["tests/runtime/intake-normalize.test.ts"],
        },
        workPackages: [
          {
            id: "pkg_startup_message",
            objective: "Update startup message",
            allowedTools: ["apply_patch"],
            inputRefs: ["thread:goal"],
            expectedArtifacts: ["patch:src/app/main.ts"],
          },
        ],
      }),
      executor: async () => ({
        nextStep: "verify",
        executionSummary: "executed startup message update",
        latestArtifacts: [
          {
            ref: "patch:src/app/main.ts",
            kind: "patch",
            summary: "Updated startup message copy",
            workPackageId: "pkg_startup_message",
          },
        ],
      }),
      verifier: async () => ({
        nextStep: "respond",
        verificationReport: {
          summary: "verified",
          passed: true,
        },
      }),
      responder: async () => ({
        nextStep: "done",
        finalResponse: "responded",
      }),
    });

    const result = await engine.start({
      threadId: "thread_1",
      runId: "run_1",
      taskId: "task_1",
      input: "fix the startup message",
    });

    expect(result.status).toBe("completed");
    expect(result.finalResponse).toBe("responded");
    expect(result.executionSummary).toBe("executed startup message update");
    expect(result.verificationSummary).toBe("verified");
    expect(store.states.has("run_1")).toBe(false);
  });

  test("等待方案选择后通过 plan_decision continuation 回到 planner", async () => {
    const store = createMemoryRunStateStore();
    let plannerCalls = 0;
    const engine = createRunLoopEngine({
      runStateStore: store,
      planner: async (state) => {
        plannerCalls += 1;
        if (!state.input.includes("已选择方案")) {
          return {
            nextStep: "waiting_plan_decision" as const,
            planDecision: {
              question: "请选择登录界面的实现方案",
              sourceInput: state.input,
              options: [
                {
                  id: "simple",
                  label: "简洁表单",
                  description: "只包含账号、密码和提交按钮。",
                  continuation: "按简洁表单方案实现登录界面。",
                },
              ],
            },
          };
        }

        return {
          nextStep: "execute" as const,
          plannerResult: {
            workPackages: [
              {
                id: "pkg_login",
                objective: "实现简洁登录表单",
                allowedTools: ["apply_patch"],
                inputRefs: ["thread:goal"],
                expectedArtifacts: ["patch:login"],
              },
            ],
            acceptanceCriteria: ["登录表单完成"],
            riskFlags: [],
            approvalRequiredActions: [],
            verificationScope: ["ui smoke"],
          },
          workPackages: [
            {
              id: "pkg_login",
              objective: "实现简洁登录表单",
              allowedTools: ["apply_patch"],
              inputRefs: ["thread:goal"],
              expectedArtifacts: ["patch:login"],
            },
          ],
        };
      },
      executor: async () => ({
        nextStep: "verify",
        executionSummary: "Executed request: 实现简洁登录表单",
      }),
      verifier: async () => ({
        nextStep: "respond",
        verificationReport: { summary: "verified", passed: true },
      }),
      responder: async () => ({
        nextStep: "done",
        finalResponse: "responded",
      }),
    });

    const blocked = await engine.start({
      threadId: "thread_plan_decision",
      runId: "run_plan_decision",
      taskId: "task_plan_decision",
      input: "我要开发一个登录界面",
    });
    const suspension = await store.loadActiveSuspensionByRun("run_plan_decision");

    expect(blocked.status).toBe("blocked");
    expect(blocked.planDecision?.question).toBe("请选择登录界面的实现方案");
    expect(suspension?.reasonKind).toBe("waiting_plan_decision");

    const resumed = await engine.resume({
      threadId: "thread_plan_decision",
      runId: "run_plan_decision",
      taskId: "task_plan_decision",
      continuation: {
        continuationId: "continuation_plan_decision",
        threadId: "thread_plan_decision",
        runId: "run_plan_decision",
        taskId: "task_plan_decision",
        kind: "plan_decision",
        optionId: "simple",
        optionLabel: "简洁表单",
        input: "我要开发一个登录界面\n\n已选择方案：简洁表单\n按简洁表单方案实现登录界面。",
        status: "created",
      },
    });

    expect(resumed.status).toBe("completed");
    expect(resumed.executionSummary).toBe("Executed request: 实现简洁登录表单");
    expect(plannerCalls).toBe(2);
  });

  test("等待审批后可通过 continuation 恢复执行", async () => {
    const store = createMemoryRunStateStore();
    let executorCalls = 0;
    const engine = createRunLoopEngine({
      runStateStore: store,
      planner: async () => ({
        nextStep: "execute",
        plannerResult: {
          workPackages: [
            {
              id: "pkg_delete",
              objective: "delete approved.txt",
              allowedTools: ["apply_patch"],
              inputRefs: ["thread:goal"],
              expectedArtifacts: ["patch:approved.txt"],
            },
          ],
          acceptanceCriteria: ["approved.txt is removed"],
          riskFlags: [],
          approvalRequiredActions: ["apply_patch.delete_file"],
          verificationScope: ["workspace file state"],
        },
        workPackages: [
          {
            id: "pkg_delete",
            objective: "delete approved.txt",
            allowedTools: ["apply_patch"],
            inputRefs: ["thread:goal"],
            expectedArtifacts: ["patch:approved.txt"],
          },
        ],
      }),
      executor: async (state) => {
        executorCalls += 1;
        if (!state.approvedApprovalRequestId) {
          return {
            nextStep: "waiting_approval",
            executionSummary: "Approval required before deleting approved.txt",
            pendingApproval: {
              summary: "Approval required before deleting approved.txt",
              approvalRequestId: "approval_1",
            },
          };
        }

        return {
          nextStep: "verify",
          approvedApprovalRequestId: state.approvedApprovalRequestId,
          executionSummary: "Deleted approved.txt",
          latestArtifacts: [
            {
              ref: "patch:approved.txt",
              kind: "patch",
              summary: "Deleted approved.txt",
              workPackageId: "pkg_delete",
            },
          ],
        };
      },
      verifier: async () => ({
        nextStep: "respond",
        verificationReport: {
          summary: "verified",
          passed: true,
        },
      }),
      responder: async () => ({
        nextStep: "done",
        finalResponse: "responded",
      }),
    });

    const blocked = await engine.start({
      threadId: "thread_1",
      runId: "run_1",
      taskId: "task_1",
      input: "clean up approved artifact",
    });

    expect(blocked.status).toBe("waiting_approval");
    expect(blocked.pauseSummary).toContain("Approval required");
    expect((await store.listSuspensionsByThread("thread_1")).length).toBe(1);

    const resumed = await engine.resume({
      threadId: "thread_1",
      runId: "run_1",
      taskId: "task_1",
      continuation: {
        continuationId: "continuation_1",
        threadId: "thread_1",
        runId: "run_1",
        taskId: "task_1",
        kind: "approval_resolution",
        approvalRequestId: "approval_1",
        decision: "approved",
        step: "execute",
        status: "created",
      },
    });

    expect(resumed.status).toBe("completed");
    expect(resumed.executionSummary).toBe("Deleted approved.txt");
    expect(resumed.finalResponse).toBe("responded");
    expect(executorCalls).toBe(2);
  });

  test("版本不兼容时返回 not_resumable，而不是抛出裸错", async () => {
    const store = createMemoryRunStateStore();
    store.states.set("run_version_mismatch", {
      stateVersion: 99,
      engineVersion: "run-loop-v99",
      threadId: "thread_version_mismatch",
      runId: "run_version_mismatch",
      taskId: "task_version_mismatch",
      input: "resume safely",
      nextStep: "waiting_approval",
      artifacts: [],
      latestArtifacts: [],
      pendingApproval: {
        summary: "Needs approval",
        approvalRequestId: "approval_version_mismatch",
      },
    });
    store.suspensions.set("suspension_version_mismatch", {
      suspensionId: "suspension_version_mismatch",
      threadId: "thread_version_mismatch",
      runId: "run_version_mismatch",
      taskId: "task_version_mismatch",
      reasonKind: "waiting_approval",
      summary: "Needs approval",
      approvalRequestId: "approval_version_mismatch",
      resumeStep: "execute",
      createdAt: new Date().toISOString(),
      status: "active",
    });

    const engine = createRunLoopEngine({
      runStateStore: store,
      planner: async () => ({ nextStep: "respond" }),
      executor: async () => ({ nextStep: "verify" }),
      verifier: async () => ({ nextStep: "respond" }),
      responder: async () => ({ nextStep: "done", finalResponse: "done" }),
    });

    const result = await engine.resume({
      threadId: "thread_version_mismatch",
      runId: "run_version_mismatch",
      taskId: "task_version_mismatch",
      continuation: {
        continuationId: "continuation_version_mismatch",
        threadId: "thread_version_mismatch",
        runId: "run_version_mismatch",
        taskId: "task_version_mismatch",
        kind: "approval_resolution",
        approvalRequestId: "approval_version_mismatch",
        decision: "approved",
        step: "execute",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.resumeDisposition).toBe("not_resumable");
  });

  test("重复 continuation 返回 already_consumed，而不是再次推进执行", async () => {
    const store = createMemoryRunStateStore();
    let executorCalls = 0;
    const engine = createRunLoopEngine({
      runStateStore: store,
      planner: async () => ({
        nextStep: "execute",
        workPackages: [{ id: "pkg_duplicate", objective: "duplicate", allowedTools: [], inputRefs: [], expectedArtifacts: [] }],
      }),
      executor: async (state) => {
        executorCalls += 1;
        if (!state.approvedApprovalRequestId) {
          return {
            nextStep: "waiting_approval",
            pendingApproval: {
              summary: "Approval required",
              approvalRequestId: "approval_duplicate",
            },
          };
        }
        return {
          nextStep: "respond",
          executionSummary: "executed once",
        };
      },
      verifier: async () => ({ nextStep: "respond", verificationReport: { summary: "verified", passed: true } }),
      responder: async () => ({ nextStep: "done", finalResponse: "done" }),
    });

    await engine.start({
      threadId: "thread_duplicate",
      runId: "run_duplicate",
      taskId: "task_duplicate",
      input: "duplicate continuation",
    });
    const continuation: ContinuationEnvelope = {
      continuationId: "continuation_duplicate",
      threadId: "thread_duplicate",
      runId: "run_duplicate",
      taskId: "task_duplicate",
      kind: "approval_resolution",
      approvalRequestId: "approval_duplicate",
      decision: "approved",
      step: "execute",
    };

    const first = await engine.resume({
      threadId: "thread_duplicate",
      runId: "run_duplicate",
      taskId: "task_duplicate",
      continuation,
    });
    const second = await engine.resume({
      threadId: "thread_duplicate",
      runId: "run_duplicate",
      taskId: "task_duplicate",
      continuation,
    });

    expect(first.status).toBe("completed");
    expect(second.resumeDisposition).toBe("already_consumed");
    expect(executorCalls).toBe(2);
  });
});
