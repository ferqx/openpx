import {
  createApprovalSuspension,
  createPlanDecisionSuspension,
  type ApprovalSuspension,
  type PlanDecisionSuspension,
  type RunSuspension,
} from "./approval-suspension";
import type {
  ApprovalResolutionContinuation,
  ContinuationEnvelope,
  PlanDecisionContinuation,
} from "./continuation";
import {
  isApprovalResolutionContinuation,
  isPlanDecisionContinuation,
} from "./continuation";
import { commitCompletedWorkPackage } from "./phase-commit";
import { createInitialRunLoopState } from "./run-loop-state";
import { dispatchNextStep } from "./step-dispatcher";
import {
  RUN_LOOP_ENGINE_VERSION,
  RUN_LOOP_STATE_VERSION,
  type RunLoopState,
} from "./step-types";
import type { RunStateStorePort } from "../../../persistence/ports/run-state-store";

type LoopRunner = (state: RunLoopState) => Promise<Partial<RunLoopState>> | Partial<RunLoopState>;

export type RunLoopEngine = {
  start(input: { threadId: string; runId: string; taskId: string; input: string }): Promise<RunLoopEngineResult>;
  resume(input: {
    threadId: string;
    runId: string;
    taskId: string;
    continuation: ApprovalResolutionContinuation | PlanDecisionContinuation;
  }): Promise<RunLoopEngineResult>;
};

export type RunLoopEngineResult = {
  status: "completed" | "waiting_approval" | "blocked";
  state: RunLoopState;
  suspension?: RunSuspension;
  resumeDisposition?: "resumed" | "already_resolved" | "already_consumed" | "invalidated" | "not_resumable";
  finalResponse?: string;
  executionSummary?: string;
  verificationSummary?: string;
  pauseSummary?: string;
  recommendationReason?: string;
  planDecision?: RunLoopState["planDecision"];
  approvedApprovalRequestId?: string;
  pendingToolCallId?: string;
  pendingToolName?: string;
  lastCompletedToolCallId?: string;
  lastCompletedToolName?: string;
};

function projectEngineResult(input: {
  state: RunLoopState;
  status: "completed" | "waiting_approval" | "blocked";
  suspension?: RunSuspension;
  resumeDisposition?: RunLoopEngineResult["resumeDisposition"];
}): RunLoopEngineResult {
  return {
    status: input.status,
    state: input.state,
    suspension: input.suspension,
    resumeDisposition: input.resumeDisposition,
    finalResponse: input.state.finalResponse,
    executionSummary: input.state.executionSummary,
    verificationSummary: input.state.verificationSummary ?? input.state.verificationReport?.summary,
    pauseSummary: input.state.pauseSummary,
    recommendationReason: input.state.recommendationReason,
    planDecision: input.state.planDecision,
    approvedApprovalRequestId: input.state.approvedApprovalRequestId,
    pendingToolCallId: input.state.pendingToolCallId,
    pendingToolName: input.state.pendingToolName,
    lastCompletedToolCallId: input.state.lastCompletedToolCallId,
    lastCompletedToolName: input.state.lastCompletedToolName,
  };
}

function mergeState(state: RunLoopState, patch: Partial<RunLoopState>): RunLoopState {
  return {
    ...state,
    ...patch,
    workPackages: patch.workPackages ?? state.workPackages,
    artifacts: patch.artifacts ?? state.artifacts,
    latestArtifacts: patch.latestArtifacts ?? state.latestArtifacts,
  };
}

function blockForResumeDisposition(input: {
  disposition: Exclude<NonNullable<RunLoopEngineResult["resumeDisposition"]>, "resumed">;
  state: RunLoopState;
  suspension?: RunSuspension;
}): RunLoopEngineResult {
  const status: RunLoopEngineResult["status"] = input.state.nextStep === "done" ? "completed" : "blocked";
  const blockedState: RunLoopState = {
    ...input.state,
    pauseSummary:
      input.state.pauseSummary
      ?? (
        input.disposition === "not_resumable"
          ? "Run-loop state is no longer safely resumable. Manual recovery is required."
          : input.disposition === "invalidated"
            ? "This approval continuation is no longer valid."
            : "This continuation has already been processed."
      ),
    recommendationReason:
      input.disposition === "not_resumable"
        ? input.state.recommendationReason ?? "Run-loop state is no longer safely resumable. Manual recovery is required."
        : input.state.recommendationReason,
  };

  return projectEngineResult({
    state: blockedState,
    status,
    suspension: input.suspension,
    resumeDisposition: input.disposition,
  });
}

export function createRunLoopEngine(input: {
  runStateStore: RunStateStorePort;
  planner: LoopRunner;
  executor: LoopRunner;
  verifier: LoopRunner;
  responder?: LoopRunner;
  emitRuntimeEvent?: (event: {
    type: "loop.step_started" | "loop.step_completed" | "loop.step_failed" | "loop.suspended" | "loop.resumed" | "loop.finished";
    payload: {
      threadId: string;
      runId: string;
      taskId: string;
      step: RunLoopState["nextStep"];
      suspensionId?: string;
      continuationId?: string;
      approvalRequestId?: string;
      resumeDisposition?: "resumed";
      failureReason?: string;
      stateVersion?: number;
      engineVersion?: string;
    };
  }) => void;
}): RunLoopEngine {
  function emitLoopEvent(event: {
    type: "loop.step_started" | "loop.step_completed" | "loop.step_failed" | "loop.suspended" | "loop.resumed" | "loop.finished";
    state: RunLoopState;
    suspensionId?: string;
    continuationId?: string;
    approvalRequestId?: string;
    resumeDisposition?: "resumed";
    failureReason?: string;
  }) {
    if (!event.state.threadId || !event.state.runId || !event.state.taskId) {
      return;
    }
    input.emitRuntimeEvent?.({
      type: event.type,
      payload: {
        threadId: event.state.threadId,
        runId: event.state.runId,
        taskId: event.state.taskId,
        step: event.state.nextStep,
        suspensionId: event.suspensionId,
        continuationId: event.continuationId,
        approvalRequestId: event.approvalRequestId,
        resumeDisposition: event.resumeDisposition,
        failureReason: event.failureReason,
        stateVersion: event.state.stateVersion,
        engineVersion: event.state.engineVersion,
      },
    });
  }

  async function waitForApproval(state: RunLoopState): Promise<RunLoopEngineResult> {
    if (!state.threadId || !state.runId || !state.taskId || !state.pendingApproval) {
      throw new Error("waiting_approval requires thread/run/task ids and pendingApproval");
    }

    const suspension = createApprovalSuspension({
      threadId: state.threadId,
      runId: state.runId,
      taskId: state.taskId,
      step: state.currentWorkPackageId ? "execute" : "plan",
      summary: state.pendingApproval.summary,
      approvalRequestId: state.pendingApproval.approvalRequestId,
    });
    const suspendedState: RunLoopState = {
      ...state,
      nextStep: "waiting_approval",
      pauseSummary: state.pendingApproval.summary,
    };
    await input.runStateStore.saveState(suspendedState);
    await input.runStateStore.saveSuspension(suspension);
    emitLoopEvent({
      type: "loop.suspended",
      state: suspendedState,
      suspensionId: suspension.suspensionId,
      approvalRequestId: suspension.approvalRequestId,
    });
    return projectEngineResult({
      state: suspendedState,
      status: "waiting_approval",
      suspension,
    });
  }

  async function waitForPlanDecision(state: RunLoopState): Promise<RunLoopEngineResult> {
    if (!state.threadId || !state.runId || !state.taskId || !state.planDecision) {
      throw new Error("waiting_plan_decision requires thread/run/task ids and planDecision");
    }

    const suspension = createPlanDecisionSuspension({
      threadId: state.threadId,
      runId: state.runId,
      taskId: state.taskId,
      summary: state.planDecision.question,
      planDecision: state.planDecision,
    });
    const suspendedState: RunLoopState = {
      ...state,
      nextStep: "waiting_plan_decision",
      pauseSummary: state.planDecision.question,
    };
    await input.runStateStore.saveState(suspendedState);
    await input.runStateStore.saveSuspension(suspension);
    emitLoopEvent({
      type: "loop.suspended",
      state: suspendedState,
      suspensionId: suspension.suspensionId,
    });
    return projectEngineResult({
      state: suspendedState,
      status: "blocked",
      suspension,
    });
  }

  async function drive(initialState: RunLoopState): Promise<RunLoopEngineResult> {
    let state = initialState;
    let budget = 32;

    while (budget > 0) {
      budget -= 1;

      try {
        switch (state.nextStep) {
          case "plan": {
            emitLoopEvent({ type: "loop.step_started", state });
            state = mergeState(state, await input.planner(state));
            emitLoopEvent({ type: "loop.step_completed", state });
            if (!state.currentWorkPackageId) {
              state.currentWorkPackageId = state.workPackages?.[0]?.id;
            }
            if (state.nextStep === "waiting_approval" && state.pendingApproval) {
              return waitForApproval(state);
            }
            if (state.nextStep === "waiting_plan_decision" && state.planDecision) {
              return waitForPlanDecision(state);
            }
            if (state.nextStep === "plan") {
              state = mergeState(state, dispatchNextStep(state));
            }
            continue;
          }

          case "execute": {
            emitLoopEvent({ type: "loop.step_started", state });
            state = mergeState(state, await input.executor(state));
            emitLoopEvent({ type: "loop.step_completed", state });
            if (state.pendingApproval || state.nextStep === "waiting_approval") {
              return waitForApproval(state);
            }
            if (state.nextStep === "execute") {
              state = mergeState(state, dispatchNextStep(state));
            }
            continue;
          }

          case "verify": {
            emitLoopEvent({ type: "loop.step_started", state });
            state = mergeState(state, await input.verifier(state));
            emitLoopEvent({ type: "loop.step_completed", state });
            state.verificationSummary = state.verificationReport?.summary ?? state.verificationSummary;
            state.verifierPassed = state.verificationReport?.passed ?? state.verifierPassed;
            state.verifierFeedback = state.verificationReport?.feedback ?? state.verifierFeedback;

            if (state.verifierPassed === false) {
              state = mergeState(state, dispatchNextStep(state));
              continue;
            }

            state = mergeState(state, commitCompletedWorkPackage(state));
            continue;
          }

          case "respond": {
            emitLoopEvent({ type: "loop.step_started", state });
            state = mergeState(
              state,
              input.responder
                ? await input.responder(state)
                : {
                    nextStep: "done",
                    finalResponse: state.executionSummary ?? `Completed request: ${state.input}`,
                  },
            );
            emitLoopEvent({ type: "loop.step_completed", state });
            continue;
          }

          case "waiting_approval":
            return waitForApproval(state);

          case "waiting_plan_decision":
            return waitForPlanDecision(state);

          case "done":
            if (state.runId) {
              await input.runStateStore.deleteActiveRunState(state.runId);
            }
            emitLoopEvent({ type: "loop.finished", state });
            return projectEngineResult({ state, status: "completed" });
        }
      } catch (error) {
        emitLoopEvent({
          type: "loop.step_failed",
          state,
          failureReason: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    const blockedState: RunLoopState = {
      ...state,
      pauseSummary:
        state.pauseSummary
        ?? "run-loop 没有取得进展，已暂停以避免无限循环。请检查 planner、executor 或 verifier 的输出。",
      recommendationReason:
        state.recommendationReason
        ?? "run-loop reached its step budget without reaching a terminal or resumable state.",
    };
    await input.runStateStore.saveState(blockedState);
    emitLoopEvent({
      type: "loop.step_failed",
      state: blockedState,
      failureReason: blockedState.pauseSummary,
    });
    return projectEngineResult({ state: blockedState, status: "blocked" });
  }

  return {
    async start(startInput) {
      return drive(createInitialRunLoopState(startInput));
    },

    async resume(resumeInput) {
      const applied = isApprovalResolutionContinuation(resumeInput.continuation)
        ? await input.runStateStore.applyApprovalContinuation({
            continuation: resumeInput.continuation,
            expectedStateVersion: RUN_LOOP_STATE_VERSION,
            expectedEngineVersion: RUN_LOOP_ENGINE_VERSION,
          })
        : isPlanDecisionContinuation(resumeInput.continuation)
          ? await input.runStateStore.applyPlanDecisionContinuation({
              continuation: resumeInput.continuation,
              expectedStateVersion: RUN_LOOP_STATE_VERSION,
              expectedEngineVersion: RUN_LOOP_ENGINE_VERSION,
            })
          : undefined;

      if (!applied) {
        throw new Error(`unsupported continuation kind for run-loop resume: ${resumeInput.continuation.kind}`);
      }

      if (applied.disposition !== "resumed") {
        return blockForResumeDisposition({
          disposition: applied.disposition,
          state: applied.state,
          suspension: applied.suspension,
        });
      }

      emitLoopEvent({
        type: "loop.resumed",
        state: applied.state,
        continuationId: applied.continuation?.continuationId,
        approvalRequestId: applied.continuation && isApprovalResolutionContinuation(applied.continuation)
          ? applied.continuation.approvalRequestId
          : undefined,
        resumeDisposition: "resumed",
      });

      return drive(applied.state);
    },
  };
}
