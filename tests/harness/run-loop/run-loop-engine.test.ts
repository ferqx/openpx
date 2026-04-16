import { describe, expect, test } from "bun:test";
import { createRunLoopEngine } from "../../../src/harness/core/run-loop/run-loop-engine";
import type { ApprovalSuspension } from "../../../src/harness/core/run-loop/approval-suspension";
import type { RunStateStorePort } from "../../../src/persistence/ports/run-state-store";
import type { RunLoopState } from "../../../src/harness/core/run-loop/step-types";
import type { ContinuationEnvelope } from "../../../src/harness/core/run-loop/continuation";

function createMemoryRunStateStore(): RunStateStorePort & {
  states: Map<string, RunLoopState>;
  suspensions: Map<string, ApprovalSuspension>;
  continuations: Map<string, ContinuationEnvelope>;
} {
  const states = new Map<string, RunLoopState>();
  const suspensions = new Map<string, ApprovalSuspension>();
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
});
