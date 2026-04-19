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

  test("denies sibling paths that only share the workspace prefix", () => {
    const policy = createPolicyEngine({ workspaceRoot: "/repo" });
    const decision = policy.evaluate({
      toolName: "apply_patch",
      effect: "apply_patch",
      action: "modify_file",
      path: "/repo-evil/src/app/main.ts",
      changedFiles: 1,
    });

    expect(decision.kind).toBe("deny");
  });

  test("allows read-only exec commands within the workspace", () => {
    const policy = createPolicyEngine({ workspaceRoot: "/repo" });
    const decision = policy.evaluate({
      toolName: "exec",
      effect: "exec",
      command: "pwd",
      cwd: "/repo",
    });

    expect(decision.kind).toBe("allow");
  });

  test("requires approval for write-like exec commands within the workspace", () => {
    const policy = createPolicyEngine({ workspaceRoot: "/repo" });
    const decision = policy.evaluate({
      toolName: "exec",
      effect: "exec",
      command: "touch",
      commandArgs: ["tmp.txt"],
      cwd: "/repo",
    });

    expect(decision.kind).toBe("needs_approval");
  });

  test("denies exec commands outside the workspace", () => {
    const policy = createPolicyEngine({ workspaceRoot: "/repo" });
    const decision = policy.evaluate({
      toolName: "exec",
      effect: "exec",
      command: "pwd",
      cwd: "/tmp",
    });

    expect(decision.kind).toBe("deny");
  });

  test("allows write-like exec and delete actions in full_access mode within allowed roots", () => {
    const policy = createPolicyEngine({
      workspaceRoot: "/repo",
      permissionMode: "full_access",
      additionalDirectories: ["/tmp/openpx-scratch"],
    });

    const execDecision = policy.evaluate({
      toolName: "exec",
      effect: "exec",
      command: "touch",
      commandArgs: ["tmp.txt"],
      cwd: "/repo",
    });
    const deleteDecision = policy.evaluate({
      toolName: "apply_patch",
      effect: "apply_patch",
      action: "delete_file",
      path: "/tmp/openpx-scratch/cache.txt",
      changedFiles: 1,
    });

    expect(execDecision.kind).toBe("allow");
    expect(deleteDecision.kind).toBe("allow");
  });

  test("still denies paths outside the allowed roots in full_access mode", () => {
    const policy = createPolicyEngine({
      workspaceRoot: "/repo",
      permissionMode: "full_access",
      additionalDirectories: ["/tmp/openpx-scratch"],
    });

    const decision = policy.evaluate({
      toolName: "apply_patch",
      effect: "apply_patch",
      action: "modify_file",
      path: "/etc/passwd",
      changedFiles: 1,
    });

    expect(decision.kind).toBe("deny");
  });
});
