import { describe, expect, test } from "bun:test";
import { artifactRecordSchema } from "../../src/runtime/artifacts/artifact-index";
import { phaseCommitNode } from "../../src/runtime/graph/root/nodes/phase-commit";

describe("phase commit", () => {
  test("parses compact artifact records for completed work packages", () => {
    const parsed = artifactRecordSchema.parse({
      ref: "patch:src/app/main.ts",
      kind: "patch",
      summary: "Updated startup message copy",
      workPackageId: "pkg_startup_message",
    });

    expect(parsed.kind).toBe("patch");
    expect(parsed.workPackageId).toBe("pkg_startup_message");
  });

  test("stores compact artifact refs and clears bulky execution details", () => {
    const result = phaseCommitNode({
      currentWorkPackageId: "pkg_startup_message",
      verificationReport: {
        summary: "All checks passed",
        passed: true,
      },
      artifacts: [],
      latestArtifacts: [
        {
          ref: "patch:src/app/main.ts",
          kind: "patch",
          summary: "Updated startup message copy",
          workPackageId: "pkg_startup_message",
        },
      ],
      workPackages: [
        {
          id: "pkg_startup_message",
          objective: "Update startup message",
          allowedTools: ["apply_patch"],
          inputRefs: ["thread:goal"],
          expectedArtifacts: ["patch:src/app/main.ts"],
        },
      ],
      executionDetails: {
        rawToolOutput: "very large raw stdout",
        diff: "--- a\n+++ b",
      },
    });

    expect(result.artifacts).toEqual([
      {
        ref: "patch:src/app/main.ts",
        kind: "patch",
        summary: "Updated startup message copy",
        workPackageId: "pkg_startup_message",
      },
    ]);
    expect(result.currentWorkPackageId).toBeUndefined();
    expect(result.executionDetails).toBeUndefined();
    expect(result.route).toBe("responder");
    expect(result.mode).toBe("respond");
    expect(result.verificationSummary).toBe("All checks passed");
  });

  test("clears transient verification state before advancing to the next work package", () => {
    const result = phaseCommitNode({
      currentWorkPackageId: "pkg_startup_message",
      verificationReport: {
        summary: "All checks passed",
        passed: true,
      },
      artifacts: [],
      latestArtifacts: [
        {
          ref: "patch:src/app/main.ts",
          kind: "patch",
          summary: "Updated startup message copy",
          workPackageId: "pkg_startup_message",
        },
      ],
      workPackages: [
        {
          id: "pkg_startup_message",
          objective: "Update startup message",
          allowedTools: ["apply_patch"],
          inputRefs: ["thread:goal"],
          expectedArtifacts: ["patch:src/app/main.ts"],
        },
        {
          id: "pkg_tests",
          objective: "Add tests",
          allowedTools: ["apply_patch"],
          inputRefs: ["thread:goal"],
          expectedArtifacts: ["test:tests/app/main.test.ts"],
        },
      ],
      executionDetails: {
        rawToolOutput: "very large raw stdout",
      },
    });

    expect(result.currentWorkPackageId).toBe("pkg_tests");
    expect(result.mode).toBe("execute");
    expect(result.route).toBe("executor");
    expect(result.latestArtifacts).toEqual([]);
    expect(result.verificationReport).toBeUndefined();
  });
});
