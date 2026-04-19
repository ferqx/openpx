/** subagent 标识。当前先以合同存在，不要求都实例化为独立运行实例。 */
export type SubagentId = "explore" | "verify" | "review" | "general";

/** subagent 规格。 */
export type SubagentSpec = {
  id: SubagentId;
  label: string;
  description: string;
};

export const SUBAGENT_SPECS: readonly SubagentSpec[] = [
  {
    id: "explore",
    label: "Explore",
    description: "面向信息收集与代码探索的子代理合同。",
  },
  {
    id: "verify",
    label: "Verify",
    description: "面向验证、检查与回归确认的子代理合同。",
  },
  {
    id: "review",
    label: "Review",
    description: "面向审阅、评估与风险识别的子代理合同。",
  },
  {
    id: "general",
    label: "General",
    description: "兜底型通用子代理合同。",
  },
];
