import {
  createApprovalSuspension,
  resolveSuspensionAfterApproval,
  type ApprovalSuspension,
} from "./approval-suspension";
import type { ContinuationEnvelope } from "./continuation";
import { commitCompletedWorkPackage } from "./phase-commit";
import { createInitialRunLoopState } from "./run-loop-state";
import { dispatchNextStep } from "./step-dispatcher";
import type { RunLoopState } from "./step-types";
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
}): RunLoopEngine {
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

      switch (state.nextStep) {
        case "plan": {
          state = mergeState(state, await input.planner(state));
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
          state = mergeState(state, await input.executor(state));
          if (state.pendingApproval || state.nextStep === "waiting_approval") {
            return waitForApproval(state);
          }
          if (state.nextStep === "execute") {
            state = mergeState(state, dispatchNextStep(state));
          }
          continue;
        }

        case "verify": {
          state = mergeState(state, await input.verifier(state));
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
          state = mergeState(
            state,
            input.responder
              ? await input.responder(state)
              : {
                  nextStep: "done",
                  finalResponse: state.executionSummary ?? `Completed request: ${state.input}`,
                },
          );
          continue;
        }

        case "waiting_approval":
          return waitForApproval(state);

        case "done":
          if (state.runId) {
            await input.runStateStore.deleteRunState(state.runId);
          }
          return projectEngineResult({ state, status: "completed" });
      }
    }

    throw new Error("run-loop step budget exhausted");
  }

  return {
    async start(startInput) {
      return drive(createInitialRunLoopState(startInput));
    },

    async resume(resumeInput) {
      const state = (await input.runStateStore.loadByRun(resumeInput.runId))
        ?? (await input.runStateStore.loadLatestByThread(resumeInput.threadId));
      if (!state) {
        throw new Error(`no run-loop state found for run ${resumeInput.runId}`);
      }

      await input.runStateStore.saveContinuation(resumeInput.continuation);
      const continuation = await input.runStateStore.consumeContinuation(resumeInput.continuation.continuationId);
      if (!continuation) {
        throw new Error(`continuation ${resumeInput.continuation.continuationId} not found`);
      }

      const suspensions = await input.runStateStore.listSuspensionsByThread(resumeInput.threadId);
      const latestSuspension = suspensions.find((item) => item.runId === resumeInput.runId);
      if (!latestSuspension) {
        throw new Error(`no suspension found for run ${resumeInput.runId}`);
      }

      const resumed = resolveSuspensionAfterApproval({
        suspension: latestSuspension,
        continuation,
        originalInput: state.input,
      });

      return drive({
        ...state,
        input: resumed.input,
        nextStep: resumed.nextStep,
        pendingApproval: undefined,
        pauseSummary: undefined,
        approvedApprovalRequestId: resumed.approvedApprovalRequestId,
      });
    },
  };
}
