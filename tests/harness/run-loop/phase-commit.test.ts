import { describe, expect, test } from "bun:test";
import { commitCompletedWorkPackage } from "../../../src/harness/core/run-loop/phase-commit";

describe("run-loop phase commit", () => {
  test("在最后一个工作包完成后进入 responder", () => {
    const result = commitCompletedWorkPackage({
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
    expect(result.nextStep).toBe("respond");
    expect(result.verificationSummary).toBe("All checks passed");
  });

  test("在仍有剩余工作包时切到下一包继续执行", () => {
    const result = commitCompletedWorkPackage({
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
    expect(result.nextStep).toBe("execute");
    expect(result.latestArtifacts).toEqual([]);
    expect(result.verificationReport).toBeUndefined();
  });
});
