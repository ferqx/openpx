import type { CheckpointPort } from "../../../persistence/ports/checkpoint-port";
import type { DerivedThreadView } from "../../../control/context/thread-compaction-types";
import type { compactThreadView } from "../../../control/context/thread-compaction-policy";
import type { ArtifactRecord } from "../../artifacts/artifact-index";
import type { PlannerResult } from "../../planning/planner-result";
import type { WorkPackage } from "../../planning/work-package";

export type RootMode = "plan" | "execute" | "verify" | "done" | "waiting_approval" | "respond";
export type RootRoute = "planner" | "approval" | "executor" | "verifier" | "finish" | "unrouted";

export type PendingApprovalState = {
  summary: string;
  reason?: string;
};

export type VerificationReport = {
  summary: string;
  passed?: boolean;
  feedback?: string;
};

export type WorkerMode = Exclude<RootMode, "done">;

export type WorkerResult<TMode extends WorkerMode = WorkerMode> = {
  summary: string;
  mode: TMode;
  isValid?: boolean;
  feedback?: string;
  plannerResult?: PlannerResult;
  workPackages?: WorkPackage[];
  latestArtifacts?: ArtifactRecord[];
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
  responder?: WorkerHandler<"respond">;
  memoryMaintainer?: WorkerHandler<"execute">;
  compactionPolicy?: {
    compact: typeof compactThreadView;
  };
  getThreadView?: (threadId: string) => Promise<DerivedThreadView | undefined>;
};
