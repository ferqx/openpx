/** harness 核心不变量：定义运行真相、审批边界与恢复语义。 */
export const HARNESS_INVARIANTS = {
  SNAPSHOT_IS_PROJECTION: {
    id: "snapshot_is_projection",
    description: "Snapshot 是读取投影，不是真相源。",
  },
  THREAD_IS_SOURCE_OF_TRUTH: {
    id: "thread_is_source_of_truth",
    description: "以 thread 为中心的持久状态是恢复、重放与复盘的真相基础。",
  },
  NO_SIDE_EFFECT_BEFORE_APPROVAL: {
    id: "no_side_effect_before_approval",
    description: "在审批边界满足之前，不得执行有副作用的动作。",
  },
  APPROVAL_MUST_RETURN_THROUGH_GRAPH: {
    id: "approval_must_return_through_graph",
    description: "审批通过后，执行必须回到图调度主路径，而不是绕过 graph 直接落地副作用。",
  },
  REJECTION_MUST_REENTER_CONTROL_FLOW: {
    id: "rejection_must_reenter_control_flow",
    description: "审批拒绝后，执行必须重新进入规划或恢复控制流，不能短路为终态。",
  },
  NO_DUPLICATE_SIDE_EFFECT_AFTER_RECOVERY: {
    id: "no_duplicate_side_effect_after_recovery",
    description: "恢复后不得重复已完成副作用，也不得造成可见状态漂移。",
  },
  NO_ARTIFACT_TRUTH_LEAKAGE: {
    id: "no_artifact_truth_leakage",
    description: "产物真相必须限定在当前 work package 内，不得泄漏历史包上下文。",
  },
  NO_SURFACE_BYPASS_OF_PROTOCOL: {
    id: "no_surface_bypass_of_protocol",
    description: "所有 surface 只能通过稳定 protocol 边界访问 harness。",
  },
} as const;

export type HarnessInvariant =
  (typeof HARNESS_INVARIANTS)[keyof typeof HARNESS_INVARIANTS];

export type HarnessInvariantId = HarnessInvariant["id"];
