/** subagent 标识。当前先以合同存在，不要求都实例化为独立运行实例。 */
export type SubagentId = "explore" | "verify" | "review" | "general";

/** subagent 权限策略：描述该合同默认能触达的动作边界。 */
export type SubagentPermissionPolicy =
  | "readonly_search"
  | "verification_only"
  | "readonly_review"
  | "inherited_minimum";

/** subagent 可见性策略：描述实例化时 surface 是否需要展示生命周期。 */
export type SubagentVisibilityPolicy = "hidden" | "visible_when_instance";

/** subagent 调用策略：描述只能自动调用，还是可由控制流混合触发。 */
export type SubagentInvocationPolicy = "automatic_only" | "hybrid";

/** subagent 成本标签：用于后续 token / compute 归因。 */
export type SubagentCostLabel = "explore" | "verify" | "review" | "general";

/** subagent 规格：从名字列表升级为最小协作合同。 */
export type SubagentSpec = {
  id: SubagentId;
  label: string;
  description: string;
  permissionPolicy: SubagentPermissionPolicy;
  visibilityPolicy: SubagentVisibilityPolicy;
  invocationPolicy: SubagentInvocationPolicy;
  costLabel: SubagentCostLabel;
  allowedTools?: readonly string[];
  contextPolicy?: string;
};

export const SUBAGENT_SPECS: readonly SubagentSpec[] = [
  {
    id: "explore",
    label: "Explore",
    description: "面向信息收集与代码探索的子代理合同。",
    permissionPolicy: "readonly_search",
    visibilityPolicy: "hidden",
    invocationPolicy: "automatic_only",
    costLabel: "explore",
  },
  {
    id: "verify",
    label: "Verify",
    description: "面向验证、检查与回归确认的子代理合同。",
    permissionPolicy: "verification_only",
    visibilityPolicy: "visible_when_instance",
    invocationPolicy: "hybrid",
    costLabel: "verify",
  },
  {
    id: "review",
    label: "Review",
    description: "面向审阅、评估与风险识别的子代理合同。",
    permissionPolicy: "readonly_review",
    visibilityPolicy: "hidden",
    invocationPolicy: "automatic_only",
    costLabel: "review",
  },
  {
    id: "general",
    label: "General",
    description: "兜底型通用子代理合同。",
    permissionPolicy: "inherited_minimum",
    visibilityPolicy: "hidden",
    invocationPolicy: "automatic_only",
    costLabel: "general",
  },
];
