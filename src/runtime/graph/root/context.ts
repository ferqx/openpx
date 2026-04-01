import type { CheckpointPort } from "../../../persistence/ports/checkpoint-port";

export type RootMode = "plan" | "execute" | "verify" | "done";

export type WorkerMode = Exclude<RootMode, "done">;

export type WorkerResult<TMode extends WorkerMode = WorkerMode> = {
  summary: string;
  mode: TMode;
};

export type WorkerExecutionContext = {
  input: string;
  threadId?: string;
  taskId?: string;
  configurable?: Record<string, unknown>;
};

export type WorkerHandler<TMode extends WorkerMode = WorkerMode> = (
  input: WorkerExecutionContext,
) => Promise<WorkerResult<TMode>> | WorkerResult<TMode>;

export type RootGraphContext = {
  checkpointer: CheckpointPort;
  planner: WorkerHandler<"plan">;
  executor: WorkerHandler<"execute">;
  verifier: WorkerHandler<"verify">;
  memoryMaintainer?: WorkerHandler<"execute">;
};
