export type RecommendationResult = {
  recommendTeam: boolean;
  reason?: string;
};

export function createRecommendationEngine() {
  function evaluateComplexity(input: string): number {
    let score = 0;
    // Check for "multiple components", "refactor", "across", etc.
    if (/\b(multiple|across|all|system-wide|architecture|redesign)\b/i.test(input)) {
      score += 4;
    }
    if (/\b(refactor|migration)\b/i.test(input)) {
      score += 4;
    }
    if (/\b(component|module|service|database|schema)\b/i.test(input)) {
      score += 2;
    }
    // Length as a proxy for complexity
    if (input.length > 200) {
      score += 2;
    }
    return score;
  }

  function evaluateRisk(input: string): number {
    let score = 0;
    // Check for "delete", "remove", "drop", "wipe", "reset", "destroy"
    if (/\b(delete|remove|drop|wipe|reset|destroy|clear|truncate)\b/i.test(input)) {
      score += 8;
    }
    // Check for sensitive areas
    if (/\b(production|prod|database|db|config|env|secrets|credentials|auth)\b/i.test(input)) {
      score += 4;
    }
    return score;
  }

  function generateReason(complexity: number, risk: number): string {
    if (risk >= 8) {
      return "This task involves high-risk operations (e.g., deletions). Recommended to use an agent team for safer execution.";
    }
    if (complexity >= 6) {
      return "This task appears complex and might affect multiple components. Recommended to use an agent team for better planning.";
    }
    return "Recommended to use an agent team for this task.";
  }

  return {
    evaluate(input: string): RecommendationResult {
      const complexity = evaluateComplexity(input);
      const risk = evaluateRisk(input);

      if (complexity >= 6 || risk >= 8) {
        return {
          recommendTeam: true,
          reason: generateReason(complexity, risk),
        };
      }

      return { recommendTeam: false };
    },
  };
}
