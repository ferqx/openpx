import { describe, expect, test } from "bun:test";
import { buildExecutionInput, buildVerifierPrompt } from "../../src/app/worker-inputs";

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
});
