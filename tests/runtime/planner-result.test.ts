import { describe, expect, test } from "bun:test";
import { plannerResultSchema } from "../../src/runtime/planning/planner-result";
import { workPackageSchema } from "../../src/runtime/planning/work-package";

describe("planner result schema", () => {
  test("parses structured planner output with compact work packages", () => {
    const parsed = plannerResultSchema.parse({
      workPackages: [
        {
          id: "pkg_startup_message",
          objective: "Update the startup message copy",
          allowedTools: ["read_file", "apply_patch"],
          inputRefs: ["thread:goal", "file:src/app/main.ts"],
          expectedArtifacts: ["patch:src/app/main.ts"],
        },
      ],
      acceptanceCriteria: ["startup message updated"],
      riskFlags: [],
      approvalRequiredActions: [],
      verificationScope: ["tests/runtime/intake-normalize.test.ts"],
    });

    expect(parsed.workPackages).toHaveLength(1);
    expect(parsed.workPackages[0]?.id).toBe("pkg_startup_message");
    expect(parsed.acceptanceCriteria).toEqual(["startup message updated"]);
  });

  test("rejects invalid work packages that omit expected artifacts", () => {
    const result = workPackageSchema.safeParse({
      id: "pkg_invalid",
      objective: "Do something",
      allowedTools: ["read_file"],
      inputRefs: ["thread:goal"],
    });

    expect(result.success).toBe(false);
  });
});
