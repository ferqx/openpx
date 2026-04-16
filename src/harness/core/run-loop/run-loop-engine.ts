import {
  createApprovalSuspension,
  resolveSuspensionAfterApproval,
  type ApprovalSuspension,
} from "./approval-suspension";
import type { ContinuationEnvelope } from "./continuation";
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
    continuation: ContinuationEnvelope;
  }): Promise<RunLoopEngineResult>;
};

export type RunLoopEngineResult = {
  status: "completed" | "waiting_approval";
  state: RunLoopState;
  suspension?: ApprovalSuspension;
  finalResponse?: string;
  executionSummary?: string;
  verificationSummary?: string;
  pauseSummary?: string;
  recommendationReason?: string;
  approvedApprovalRequestId?: string;
  pendingToolCallId?: string;
  pendingToolName?: string;
  lastCompletedToolCallId?: string;
  lastCompletedToolName?: string;
};

function projectEngineResult(input: {
  state: RunLoopState;
  status: "completed" | "waiting_approval";
  suspension?: ApprovalSuspension;
}): RunLoopEngineResult {
  return {
    status: input.status,
    state: input.state,
    suspension: input.suspension,
    finalResponse: input.state.finalResponse,
    executionSummary: input.state.executionSummary,
    verificationSummary: input.state.verificationSummary ?? input.state.verificationReport?.summary,
    pauseSummary: input.state.pauseSummary,
    recommendationReason: input.state.recommendationReason,
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

    throw new Error("run-loop step budget exhausted");
  }

  return {
    async start(startInput) {
      return drive(createInitialRunLoopState(startInput));
    },

    async resume(resumeInput) {
      const state = await input.runStateStore.loadByRun(resumeInput.runId);
      if (!state) {
        throw new Error(`no run-loop state found for run ${resumeInput.runId}`);
      }
      if (
        state.stateVersion !== RUN_LOOP_STATE_VERSION
        || state.engineVersion !== RUN_LOOP_ENGINE_VERSION
      ) {
        throw new Error(`run-loop state version mismatch for run ${resumeInput.runId}`);
      }

      await input.runStateStore.saveContinuation(resumeInput.continuation);
      const continuation = await input.runStateStore.consumeContinuation(resumeInput.continuation.continuationId);
      if (!continuation) {
        throw new Error(`continuation ${resumeInput.continuation.continuationId} not found`);
      }

      const suspension = await input.runStateStore.loadActiveSuspensionByRun(resumeInput.runId);
      if (!suspension) {
        throw new Error(`no suspension found for run ${resumeInput.runId}`);
      }
      if (
        suspension.threadId !== resumeInput.threadId
        || suspension.runId !== resumeInput.runId
        || suspension.approvalRequestId !== continuation.approvalRequestId
      ) {
        throw new Error(`continuation ${continuation.continuationId} does not match run ${resumeInput.runId}`);
      }
      const transitionApplied = continuation.decision === "approved"
        ? await input.runStateStore.resolveSuspension({
            suspensionId: suspension.suspensionId,
            continuationId: continuation.continuationId,
          })
        : await input.runStateStore.invalidateSuspension({
            suspensionId: suspension.suspensionId,
            reason: continuation.reason ?? "approval rejected",
          });
      if (!transitionApplied) {
        throw new Error(`suspension ${suspension.suspensionId} is no longer active`);
      }

      const resumed = resolveSuspensionAfterApproval({
        suspension,
        continuation,
        originalInput: state.input,
      });

      const resumedState: RunLoopState = {
        ...state,
        input: resumed.input,
        nextStep: resumed.nextStep,
        pendingApproval: undefined,
        pauseSummary: undefined,
        approvedApprovalRequestId: resumed.approvedApprovalRequestId,
      };
      await input.runStateStore.saveState(resumedState);
      emitLoopEvent({
        type: "loop.resumed",
        state: resumedState,
        continuationId: continuation.continuationId,
        approvalRequestId: continuation.approvalRequestId,
        resumeDisposition: "resumed",
      });

      return drive(resumedState);
    },
  };
}
