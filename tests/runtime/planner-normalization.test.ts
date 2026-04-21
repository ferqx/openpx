import { describe, expect, test } from "bun:test";
import { normalizePlannerOutput } from "../../src/runtime/planning/planner-normalization";

describe("planner normalization", () => {
  test("promotes implementation intents that were misclassified as respond-only", () => {
    const normalized = normalizePlannerOutput({
      inputText: "我要开发一个登录界面",
      summary: "Plan to respond to the user's request about developing a login interface.",
      plannerResult: {
        workPackages: [
          {
            id: "pkg_respond",
            objective: "Respond to user's request about developing a login interface by asking clarifying questions and offering assistance.",
            capabilityMarker: "respond_only",
            allowedTools: ["read_file"],
            inputRefs: ["thread:goal"],
            expectedArtifacts: ["summary:response"],
          },
        ],
        acceptanceCriteria: ["Response addresses the user's request."],
        riskFlags: [],
        approvalRequiredActions: [],
        verificationScope: ["Response is helpful."],
      },
    });

    expect(normalized.plannerResult.workPackages[0]?.capabilityMarker).toBe("implementation_work");
    expect(normalized.plannerResult.workPackages[0]?.capabilityFamily).toBe("feature_implementation");
    expect(normalized.plannerResult.workPackages[0]?.objective).toContain("我要开发一个登录界面");
    expect(normalized.plannerResult.workPackages[0]?.allowedTools).toContain("apply_patch");
  });
});
