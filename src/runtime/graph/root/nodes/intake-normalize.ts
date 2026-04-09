type IntakeRiskLevel = "low" | "medium" | "high";

export type NormalizedIntake = {
  goal: string;
  constraints: string[];
  successCriteria: string[];
  riskLevel: IntakeRiskLevel;
  requiresCodeChange: boolean;
  requiresExternalAction: boolean;
};

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

function deriveSuccessCriteria(goal: string): string[] {
  const normalizedGoal = goal.toLowerCase();
  const updateMatch = normalizedGoal.match(/^(fix|update|change|improve)\s+(.+)$/);

  if (updateMatch) {
    return [`${updateMatch[2]} updated`];
  }

  return [`${goal} completed`];
}

function deriveRiskLevel(goal: string): IntakeRiskLevel {
  if (/\b(delete|drop|reset|destroy|wipe)\b/.test(goal)) {
    return "high";
  }

  if (/\b(deploy|release|migrate|publish)\b/.test(goal)) {
    return "medium";
  }

  return "low";
}

function inferRequiresCodeChange(goal: string): boolean {
  if (/\b(explain|why|what|review|verify|inspect|analyze)\b/.test(goal)) {
    return false;
  }

  return true;
}

function inferRequiresExternalAction(goal: string): boolean {
  return /\b(deploy|release|publish|send|email|call)\b/.test(goal);
}
