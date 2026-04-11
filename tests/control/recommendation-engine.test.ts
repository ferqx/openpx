import { describe, expect, test } from "bun:test";
import { createRecommendationEngine } from "../../src/control/policy/recommendation-engine";

describe("RecommendationEngine", () => {
  const engine = createRecommendationEngine();

  test("recommends team for high-risk deletions", () => {
    const result = engine.evaluate("delete all files in src/");
    expect(result.recommendTeam).toBe(true);
    expect(result.reason).toContain("high-risk operations");
  });

  test("does not recommend team for a scoped single-file deletion", () => {
    const result = engine.evaluate("delete src/planner.ts");
    expect(result.recommendTeam).toBe(false);
  });

  test("does not recommend team for a scoped single-file deletion with reject fallback instructions", () => {
    const result = engine.evaluate(
      "Delete src/approval-target.ts, but if I reject it then continue safely without deleting files.",
    );
    expect(result.recommendTeam).toBe(false);
  });

  test("does not recommend team for system-generated replan inputs", () => {
    const result = engine.evaluate(
      "Tool approval was rejected for capability apply_patch.delete_file. Replan safely with avoid_same_capability_marker.",
    );
    expect(result.recommendTeam).toBe(false);
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
