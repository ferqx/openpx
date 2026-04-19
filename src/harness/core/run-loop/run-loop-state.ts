import {
  RUN_LOOP_ENGINE_VERSION,
  RUN_LOOP_STATE_VERSION,
  type RunLoopState,
} from "./step-types";

/** 构造 fresh run-loop state。 */
export function createInitialRunLoopState(input: {
  threadId: string;
  runId: string;
  taskId: string;
  input: string;
}): RunLoopState {
  return {
    stateVersion: RUN_LOOP_STATE_VERSION,
    engineVersion: RUN_LOOP_ENGINE_VERSION,
    threadId: input.threadId,
    runId: input.runId,
    taskId: input.taskId,
    input: input.input,
    nextStep: "plan",
    artifacts: [],
    latestArtifacts: [],
    workPackages: [],
  };
}
