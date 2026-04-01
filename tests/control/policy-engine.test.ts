import { describe, expect, test } from "bun:test";
import { createPolicyEngine } from "../../src/control/policy/policy-engine";

describe("PolicyEngine", () => {
  test("approves ordinary source-file apply_patch edits automatically", () => {
    const policy = createPolicyEngine({ workspaceRoot: "/repo" });
    const decision = policy.evaluate({
      toolName: "apply_patch",
      effect: "apply_patch",
      action: "modify_file",
      path: "/repo/src/app/main.ts",
      changedFiles: 1,
    });

    expect(decision.kind).toBe("allow");
  });

  test("requires approval for delete_file", () => {
    const policy = createPolicyEngine({ workspaceRoot: "/repo" });
    const decision = policy.evaluate({
      toolName: "apply_patch",
      effect: "apply_patch",
      action: "delete_file",
      path: "/repo/src/app/main.ts",
      changedFiles: 1,
    });

    expect(decision.kind).toBe("needs_approval");
  });
});
