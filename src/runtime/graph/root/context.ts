export type RootMode = "plan" | "execute" | "verify" | "done";

export type WorkerMode = Exclude<RootMode, "done">;

export type WorkerResult<TMode extends WorkerMode = WorkerMode> = {
  summary: string;
  mode: TMode;
};

export type WorkerHandler<TMode extends WorkerMode = WorkerMode> = (input: {
  input: string;
}) => Promise<WorkerResult<TMode>> | WorkerResult<TMode>;

export type RootGraphContext = {
  planner: WorkerHandler<"plan">;
  executor: WorkerHandler<"execute">;
  verifier: WorkerHandler<"verify">;
  memoryMaintainer?: WorkerHandler<"execute">;
};
