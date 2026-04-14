import type { CheckpointPort } from "../../../persistence/ports/checkpoint-port";
import type { DerivedThreadView } from "../../../control/context/thread-compaction-types";
import type { compactThreadView } from "../../../control/context/thread-compaction-policy";
import type { ArtifactRecord } from "../../artifacts/artifact-index";
import type { PlannerResult } from "../../planning/planner-result";
import type { WorkPackage } from "../../planning/work-package";

/** 根图主模式：plan/execute/verify/done/waiting_approval/respond */
export type RootMode = "plan" | "execute" | "verify" | "done" | "waiting_approval" | "respond";
/** 根图路由结果：决定下一步进入哪个节点 */
export type RootRoute = "planner" | "approval" | "executor" | "verifier" | "finish" | "unrouted";

/** 待审批状态：供 approval-gate 和 UI 生成审批提示 */
export type PendingApprovalState = {
  summary: string;
  reason?: string;
};

/** 验证报告：记录 verifier 的结论与反馈 */
export type VerificationReport = {
  summary: string;
  passed?: boolean;
  feedback?: string;
};

/** worker 模式：排除 done，只保留可执行 worker 的阶段 */
export type WorkerMode = Exclude<RootMode, "done">;

/** worker 返回值的稳定形状：planner/executor/verifier/responder 都向这里对齐 */
export type WorkerResult<TMode extends WorkerMode = WorkerMode> = {
  summary: string;
  mode: TMode;
  isValid?: boolean;
  feedback?: string;
  plannerResult?: PlannerResult;
  workPackages?: WorkPackage[];
  latestArtifacts?: ArtifactRecord[];
  approvedApprovalRequestId?: string;
  lastCompletedToolCallId?: string;
  lastCompletedToolName?: string;
  pendingToolCallId?: string;
  pendingToolName?: string;
};

/** worker 执行上下文：根图传给具体 worker 的最小事实集合 */
export type WorkerExecutionContext = {
  input: string;
  threadId?: string;
  taskId?: string;
  currentWorkPackage?: WorkPackage;
  artifacts?: ArtifactRecord[];
  plannerResult?: PlannerResult;
  approvedApprovalRequestId?: string;
  configurable?: Record<string, unknown>;
};

/** worker 处理器接口 */
export type WorkerHandler<TMode extends WorkerMode = WorkerMode> = (
  input: WorkerExecutionContext,
) => Promise<WorkerResult<TMode>> | WorkerResult<TMode>;

/** 根图上下文：组装 planner/executor/verifier/checkpointer 等运行期能力 */
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
