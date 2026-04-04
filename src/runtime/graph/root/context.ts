import type { CheckpointPort } from "../../../persistence/ports/checkpoint-port";
import type { compactThreadView } from "../../../control/context/thread-compaction-policy";

export type RootMode = "plan" | "execute" | "verify" | "done" | "waiting_approval";

export type WorkerMode = Exclude<RootMode, "done">;

export type WorkerResult<TMode extends WorkerMode = WorkerMode> = {
  summary: string;
  mode: TMode;
  isValid?: boolean;
  feedback?: string;
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
  compactionPolicy?: {
    compact: typeof compactThreadView;
  };
  getThreadView?: (threadId: string) => Promise<any>;
};
