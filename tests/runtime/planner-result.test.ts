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
          capabilityMarker: "respond_only",
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
    expect(parsed.workPackages[0]?.capabilityMarker).toBe("respond_only");
    expect(parsed.acceptanceCriteria).toEqual(["startup message updated"]);
  });

  test("parses delete capability normalization fields", () => {
    const parsed = workPackageSchema.parse({
      id: "pkg_delete",
      objective: "Delete src/approval-target.ts after explicit approval",
      capabilityMarker: "apply_patch.delete_file",
      capabilityFamily: "approval_gated_delete",
      requiresApproval: true,
      allowedTools: ["apply_patch"],
      inputRefs: ["thread:goal", "file:src/approval-target.ts"],
      expectedArtifacts: ["patch:src/approval-target.ts"],
    });

    expect(parsed.capabilityMarker).toBe("apply_patch.delete_file");
    expect(parsed.capabilityFamily).toBe("approval_gated_delete");
    expect(parsed.requiresApproval).toBe(true);
  });

  test("parses implementation work as a first-class capability marker", () => {
    const parsed = workPackageSchema.parse({
      id: "pkg_login_ui",
      objective: "实现登录界面",
      capabilityMarker: "implementation_work",
      capabilityFamily: "feature_implementation",
      requiresApproval: false,
      allowedTools: ["read_file", "apply_patch"],
      inputRefs: ["thread:goal"],
      expectedArtifacts: ["patch:workspace"],
    });

    expect(parsed.capabilityMarker).toBe("implementation_work");
    expect(parsed.capabilityFamily).toBe("feature_implementation");
  });

  test("parses plan decision requests with selectable options", () => {
    const parsed = plannerResultSchema.parse({
      workPackages: [],
      acceptanceCriteria: ["用户选择一个登录界面方案后再执行"],
      riskFlags: [],
      approvalRequiredActions: [],
      verificationScope: ["选择后继续执行"],
      decisionRequest: {
        question: "请选择登录界面的实现方案",
        options: [
          {
            id: "simple",
            label: "简洁表单",
            description: "只包含账号、密码和提交按钮。",
            continuation: "按简洁表单方案实现登录界面。",
          },
          {
            id: "brand",
            label: "品牌化登录页",
            description: "增加品牌区、辅助说明和更完整的视觉层次。",
            continuation: "按品牌化登录页方案实现登录界面。",
          },
        ],
      },
    });

    expect(parsed.decisionRequest?.options).toHaveLength(2);
    expect(parsed.decisionRequest?.options[1]?.label).toBe("品牌化登录页");
  });

  test("parses reject-driven replan normalization fields", () => {
    const parsed = workPackageSchema.parse({
      id: "pkg_safe_replan",
      objective: "Continue safely without deleting files",
      capabilityMarker: "respond_only",
      capabilityFamily: "reject_replan_delete",
      requiresApproval: false,
      replanHint: "avoid_same_capability_marker",
      allowedTools: ["read_file"],
      inputRefs: ["thread:goal"],
      expectedArtifacts: ["response:safe-replan"],
    });

    expect(parsed.capabilityMarker).toBe("respond_only");
    expect(parsed.capabilityFamily).toBe("reject_replan_delete");
    expect(parsed.replanHint).toBe("avoid_same_capability_marker");
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
