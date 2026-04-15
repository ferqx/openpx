/** intake 风险等级：仅用于主路径的粗粒度归一化 */
type IntakeRiskLevel = "low" | "medium" | "high";

/** 归一化后的 intake：把原始输入折成 goal / success criteria / 风险等结构 */
export type NormalizedIntake = {
  goal: string;
  constraints: string[];
  successCriteria: string[];
  riskLevel: IntakeRiskLevel;
  requiresCodeChange: boolean;
  requiresExternalAction: boolean;
};

/** 归一化 intake 节点：当前版本采用启发式规则，而不是单独调用模型 */
export function intakeNormalizeNode(state: { input: string }): { normalizedInput: NormalizedIntake } {
  const goal = state.input.trim();
  const normalizedGoal = goal.toLowerCase();

  return {
    normalizedInput: {
      goal,
      constraints: [],
      successCriteria: deriveSuccessCriteria(goal),
      riskLevel: deriveRiskLevel(normalizedGoal),
      requiresCodeChange: inferRequiresCodeChange(normalizedGoal),
      requiresExternalAction: inferRequiresExternalAction(normalizedGoal),
    },
  };
}

/** 生成最小成功标准：供 planner / validation 使用 */
function deriveSuccessCriteria(goal: string): string[] {
  const normalizedGoal = goal.toLowerCase();
  const updateMatch = normalizedGoal.match(/^(fix|update|change|improve)\s+(.+)$/);

  if (updateMatch) {
    return [`${updateMatch[2]} updated`];
  }

  return [`${goal} completed`];
}

/** 用关键词粗分风险级别 */
function deriveRiskLevel(goal: string): IntakeRiskLevel {
  if (/\b(delete|drop|reset|destroy|wipe)\b/.test(goal)) {
    return "high";
  }

  if (/\b(deploy|release|migrate|publish)\b/.test(goal)) {
    return "medium";
  }

  return "low";
}

/** 推断是否需要代码改动 */
function inferRequiresCodeChange(goal: string): boolean {
  if (/\b(explain|why|what|review|verify|inspect|analyze)\b/.test(goal)) {
    return false;
  }

  return true;
}

/** 推断是否需要外部动作，例如 deploy / send / publish */
function inferRequiresExternalAction(goal: string): boolean {
  return /\b(deploy|release|publish|send|email|call)\b/.test(goal);
}
