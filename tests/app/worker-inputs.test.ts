import { describe, expect, test } from "bun:test";
import {
  buildApprovedExecutionArtifacts,
  buildExecutionArtifacts,
  buildExecutionInput,
  buildVerifierPrompt,
} from "../../src/app/worker-inputs";

describe("worker input builders", () => {
  test("prefers the active work package objective for execution", () => {
    const input = buildExecutionInput({
      input: "make startup copy nicer",
      currentWorkPackage: {
        id: "pkg_startup_message",
        objective: "Update startup message copy",
        allowedTools: ["read_file", "apply_patch"],
        inputRefs: ["thread:goal", "file:src/app/main.ts"],
        expectedArtifacts: ["patch:src/app/main.ts"],
      },
    });

    expect(input).toBe("Update startup message copy");
  });

  test("keeps verifier feedback when building execution input", () => {
    const input = buildExecutionInput({
      input: "make startup copy nicer\n\nVerification failed: missing tests. Please fix these issues and verify again.",
      currentWorkPackage: {
        id: "pkg_startup_message",
        objective: "Update startup message copy",
        allowedTools: ["read_file", "apply_patch"],
        inputRefs: ["thread:goal", "file:src/app/main.ts"],
        expectedArtifacts: ["patch:src/app/main.ts"],
      },
    });

    expect(input).toContain("Update startup message copy");
    expect(input).toContain("Verification failed: missing tests");
  });

  test("builds verifier prompts from active work package context", () => {
    const prompt = buildVerifierPrompt({
      input: "please verify",
      currentWorkPackage: {
        id: "pkg_startup_message",
        objective: "Update startup message copy",
        allowedTools: ["read_file", "apply_patch"],
        inputRefs: ["thread:goal", "file:src/app/main.ts"],
        expectedArtifacts: ["patch:src/app/main.ts"],
      },
      artifacts: [
        {
          ref: "patch:src/app/main.ts",
          kind: "patch",
          summary: "Updated startup message copy",
          workPackageId: "pkg_startup_message",
        },
      ],
      plannerResult: {
        workPackages: [
          {
            id: "pkg_startup_message",
            objective: "Update startup message copy",
            allowedTools: ["read_file", "apply_patch"],
            inputRefs: ["thread:goal", "file:src/app/main.ts"],
            expectedArtifacts: ["patch:src/app/main.ts"],
          },
        ],
        acceptanceCriteria: ["startup message updated"],
        riskFlags: [],
        approvalRequiredActions: [],
        verificationScope: ["tests/runtime/intake-normalize.test.ts"],
      },
    });

    expect(prompt).toContain("Update startup message copy");
    expect(prompt).toContain("patch:src/app/main.ts");
    expect(prompt).toContain("tests/runtime/intake-normalize.test.ts");
  });

  test("builds compact artifacts for generic execution results", () => {
    const artifacts = buildExecutionArtifacts({
      summary: "Executed request: Update startup message copy",
      currentWorkPackage: {
        id: "pkg_startup_message",
        objective: "Update startup message copy",
        allowedTools: ["read_file", "apply_patch"],
        inputRefs: ["thread:goal", "file:src/app/main.ts"],
        expectedArtifacts: ["patch:src/app/main.ts"],
      },
    });

    expect(artifacts).toEqual([
      {
        ref: "patch:src/app/main.ts",
        kind: "patch",
        summary: "Executed request: Update startup message copy",
        workPackageId: "pkg_startup_message",
      },
    ]);
  });

  test("builds deterministic delete artifacts from executed paths", () => {
    const artifacts = buildExecutionArtifacts({
      summary: "Deleted src/old.ts",
      currentWorkPackage: {
        id: "pkg_delete",
        objective: "Delete old source file",
        allowedTools: ["apply_patch"],
        inputRefs: ["thread:goal", "file:src/old.ts"],
        expectedArtifacts: ["patch:src/old.ts"],
      },
      changedPath: "src/old.ts",
    });

    expect(artifacts[0]?.ref).toBe("patch:src/old.ts");
    expect(artifacts[0]?.workPackageId).toBe("pkg_delete");
  });

  test("builds artifacts for approved tool requests with workspace-relative refs", () => {
    const artifacts = buildApprovedExecutionArtifacts({
      workspaceRoot: "/tmp/openpx-workspace",
      toolRequest: {
        toolCallId: "tool-approve",
        threadId: "thread-approve",
        taskId: "task-approve",
        toolName: "apply_patch",
        args: { content: "approved\n" },
        action: "create_file",
        path: "/tmp/openpx-workspace/approved.txt",
        changedFiles: 1,
      },
      summary: "apply_patch create_file approved.txt",
      currentWorkPackage: {
        id: "pkg_approve",
        objective: "Create approved file",
        allowedTools: ["apply_patch"],
        inputRefs: ["thread:goal"],
        expectedArtifacts: ["patch:approved.txt"],
      },
    });

    expect(artifacts).toEqual([
      {
        ref: "patch:approved.txt",
        kind: "patch",
        summary: "apply_patch create_file approved.txt",
        workPackageId: "pkg_approve",
      },
    ]);
  });
});
