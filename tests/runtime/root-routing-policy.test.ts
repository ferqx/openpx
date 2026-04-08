import { describe, expect, test } from "bun:test";
import { routeNext } from "../../src/runtime/graph/root/root-routing-policy";

describe("root routing policy", () => {
  test("routes to planner when no work packages exist", () => {
    expect(
      routeNext({
        workPackages: [],
        artifacts: [],
      }),
    ).toEqual({
      route: "planner",
      mode: "plan",
      currentWorkPackageId: undefined,
    });
  });

  test("routes to approval when a pending approval exists", () => {
    expect(
      routeNext({
        workPackages: [],
        pendingApproval: {
          summary: "delete src/old.ts",
        },
        artifacts: [],
      }),
    ).toEqual({
      route: "approval",
      mode: "waiting_approval",
      currentWorkPackageId: undefined,
    });
  });

  test("routes to executor when the current package has not produced artifacts", () => {
    expect(
      routeNext({
        workPackages: [
          {
            id: "pkg_1",
            objective: "Update startup message",
            allowedTools: ["apply_patch"],
            inputRefs: ["thread:goal"],
            expectedArtifacts: ["patch:src/app/main.ts"],
          },
        ],
        artifacts: [],
      }),
    ).toEqual({
      route: "executor",
      mode: "execute",
      currentWorkPackageId: "pkg_1",
    });
  });

  test("routes to verifier after artifacts exist for the current package", () => {
    expect(
      routeNext({
        workPackages: [
          {
            id: "pkg_1",
            objective: "Update startup message",
            allowedTools: ["apply_patch"],
            inputRefs: ["thread:goal"],
            expectedArtifacts: ["patch:src/app/main.ts"],
          },
        ],
        currentWorkPackageId: "pkg_1",
        artifacts: [
          {
            ref: "patch:src/app/main.ts",
            kind: "patch",
            summary: "Updated startup message copy",
            workPackageId: "pkg_1",
          },
        ],
      }),
    ).toEqual({
      route: "verifier",
      mode: "verify",
      currentWorkPackageId: "pkg_1",
    });
  });

  test("ignores artifacts that belong to previous work packages", () => {
    expect(
      routeNext({
        workPackages: [
          {
            id: "pkg_1",
            objective: "Update startup message",
            allowedTools: ["apply_patch"],
            inputRefs: ["thread:goal"],
            expectedArtifacts: ["patch:src/app/main.ts"],
          },
          {
            id: "pkg_2",
            objective: "Add tests",
            allowedTools: ["apply_patch"],
            inputRefs: ["thread:goal"],
            expectedArtifacts: ["test:tests/app/main.test.ts"],
          },
        ],
        currentWorkPackageId: "pkg_2",
        artifacts: [
          {
            ref: "patch:src/app/main.ts",
            kind: "patch",
            summary: "Updated startup message copy",
            workPackageId: "pkg_1",
          },
        ],
      }),
    ).toEqual({
      route: "executor",
      mode: "execute",
      currentWorkPackageId: "pkg_2",
    });
  });

  test("routes to finish after verification passes", () => {
    expect(
      routeNext({
        workPackages: [
          {
            id: "pkg_1",
            objective: "Update startup message",
            allowedTools: ["apply_patch"],
            inputRefs: ["thread:goal"],
            expectedArtifacts: ["patch:src/app/main.ts"],
          },
        ],
        currentWorkPackageId: "pkg_1",
        artifacts: [
          {
            ref: "patch:src/app/main.ts",
            kind: "patch",
            summary: "Updated startup message copy",
            workPackageId: "pkg_1",
          },
        ],
        verificationReport: {
          summary: "All checks passed",
          passed: true,
        },
      }),
    ).toEqual({
      route: "finish",
      mode: "done",
      currentWorkPackageId: "pkg_1",
    });
  });
});
