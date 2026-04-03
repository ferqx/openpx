import { describe, expect, test } from "bun:test";
import { createRecommendationEngine } from "../../src/control/policy/recommendation-engine";

describe("RecommendationEngine", () => {
  const engine = createRecommendationEngine();

  test("recommends team for high-risk deletions", () => {
    const result = engine.evaluate("delete all files in src/");
    expect(result.recommendTeam).toBe(true);
    expect(result.reason).toContain("high-risk operations");
  });

  test("recommends team for complex refactors", () => {
    const result = engine.evaluate("refactor the whole system architecture across multiple components");
    expect(result.recommendTeam).toBe(true);
    expect(result.reason).toContain("complex");
  });

  test("does not recommend team for simple tasks", () => {
    const result = engine.evaluate("fix typo in README.md");
    expect(result.recommendTeam).toBe(false);
  });
});
