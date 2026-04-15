import type { RunLoopState } from "./step-types";

/** 构造 fresh run-loop state。 */
export function createInitialRunLoopState(input: {
  threadId: string;
  runId: string;
  taskId: string;
  input: string;
}): RunLoopState {
  return {
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
