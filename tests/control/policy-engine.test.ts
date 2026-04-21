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

  test("requires approval for sibling paths that only share the workspace prefix", () => {
    const policy = createPolicyEngine({ workspaceRoot: "/repo" });
    const decision = policy.evaluate({
      toolName: "apply_patch",
      effect: "apply_patch",
      action: "modify_file",
      path: "/repo-evil/src/app/main.ts",
      changedFiles: 1,
    });

    expect(decision.kind).toBe("needs_approval");
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

  test("requires approval for exec commands outside the workspace", () => {
    const policy = createPolicyEngine({ workspaceRoot: "/repo" });
    const decision = policy.evaluate({
      toolName: "exec",
      effect: "exec",
      command: "pwd",
      cwd: "/tmp",
    });

    expect(decision.kind).toBe("needs_approval");
  });

  test("allows write-like exec in full_access mode within the workspace", () => {
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
    expect(execDecision.kind).toBe("allow");
  });

  test("still requires approval for paths outside the workspace in full_access mode", () => {
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

    expect(decision.kind).toBe("needs_approval");
  });
});
