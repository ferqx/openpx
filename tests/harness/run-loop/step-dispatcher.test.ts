import { describe, expect, test } from "bun:test";
import { dispatchNextStep } from "../../../src/harness/core/run-loop/step-dispatcher";

const startupMessageWorkPackage = {
  id: "pkg_startup_message",
  objective: "Update startup message",
  allowedTools: ["read_file", "apply_patch"],
  inputRefs: ["thread:goal", "file:src/app/main.ts"],
  expectedArtifacts: ["patch:src/app/main.ts"],
};

describe("run-loop step dispatcher", () => {
  test("没有工作包时先去 planner", () => {
    const decision = dispatchNextStep({
      input: "plan the repository",
      workPackages: [],
      artifacts: [],
      latestArtifacts: [],
    });

    expect(decision.nextStep).toBe("plan");
  });

  test("当前包还没有 artifact 时进入 execute", () => {
    const decision = dispatchNextStep({
      input: "continue",
      workPackages: [startupMessageWorkPackage],
      currentWorkPackageId: "pkg_startup_message",
      artifacts: [],
      latestArtifacts: [],
    });

    expect(decision.nextStep).toBe("execute");
    expect(decision.currentWorkPackageId).toBe("pkg_startup_message");
  });

  test("当前包已有 artifact 但还没验证时进入 verify", () => {
    const decision = dispatchNextStep({
      input: "continue",
      workPackages: [startupMessageWorkPackage],
      currentWorkPackageId: "pkg_startup_message",
      artifacts: [
        {
          ref: "patch:src/app/main.ts",
          kind: "patch",
          summary: "Updated startup message copy",
          workPackageId: "pkg_startup_message",
        },
      ],
      latestArtifacts: [],
    });

    expect(decision.nextStep).toBe("verify");
  });

  test("验证失败时带着反馈回到 execute", () => {
    const decision = dispatchNextStep({
      input: "verify the repository",
      currentWorkPackageId: "pkg_startup_message",
      verifierPassed: false,
      verifierFeedback: "missing tests",
    });

    expect(decision.nextStep).toBe("execute");
    expect(decision.input).toContain("missing tests");
  });
});
