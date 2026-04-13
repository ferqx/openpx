import { describe, expect, test } from "bun:test";
import {
  validationEvidenceBundleSchema,
  validationPermissionModeSchema,
  validationScenarioFileSpecSchema,
  validationScenarioSpecSchema,
  validationSuiteSummarySchema,
  validationVerdictSchema,
} from "../../src/validation/validation-schema";
import { renderValidationEngineeringView, renderValidationProductGateView } from "../../src/validation/reporting";

describe("validation schema", () => {
  test("parses guarded and full-access sandbox policies", () => {
    const guarded = validationScenarioSpecSchema.parse({
      id: "validation-guarded",
      summary: "guarded validation scenario",
      taskPrompt: "repair the broken task",
      repoSource: {
        repoId: "repo-a",
        snapshot: "abc123",
        localPath: "/tmp/repo-a",
      },
      sandboxPolicy: {
        permissionMode: "guarded",
        networkMode: "off",
        writableRoots: ["workspace"],
        allowedCommandClasses: ["read", "test"],
        escalationCommandClasses: ["network", "destructive_shell"],
        destructiveActionPolicy: "ask",
      },
      taskFamily: {
        primary: "approval_control",
        secondary: ["shell_execution"],
      },
      scoringProfile: {
        outcomeWeight: 0.5,
        trajectoryWeight: 0.3,
        controlWeight: 0.2,
      },
      backend: {
        kind: "deterministic_eval",
        suiteId: "core-eval-suite",
        scenarioId: "approval-required-then-approved",
      },
      acceptanceChecks: [
        {
          id: "repo-exists",
          kind: "file_exists",
          path: "README.md",
        },
      ],
    });

    const fullAccess = validationPermissionModeSchema.parse("full_access");

    expect(guarded.sandboxPolicy.permissionMode).toBe("guarded");
    expect(fullAccess).toBe("full_access");
  });

  test("parses scenario file specs with suite memberships and available permission modes", () => {
    const fileSpec = validationScenarioFileSpecSchema.parse({
      id: "openpx-deterministic",
      summary: "openpx deterministic validation",
      taskPrompt: "repair the approval flow",
      repoSource: {
        repoId: "openpx",
        snapshot: "workspace",
        localPath: ".",
      },
      sandboxPolicy: {
        permissionMode: "guarded",
        availablePermissionModes: ["guarded", "full_access"],
        networkMode: "off",
        writableRoots: ["workspace"],
        allowedCommandClasses: ["read", "test"],
        escalationCommandClasses: ["destructive_shell"],
        destructiveActionPolicy: "ask",
      },
      taskFamily: {
        primary: "approval_control",
        secondary: ["shell_execution"],
      },
      scoringProfile: {
        outcomeWeight: 0.5,
        trajectoryWeight: 0.3,
        controlWeight: 0.2,
      },
      backend: {
        kind: "deterministic_eval",
        suiteId: "core-eval-suite",
        scenarioId: "approval-required-then-approved",
      },
      acceptanceChecks: [],
      suites: ["engineering", "release_gate"],
    });

    expect(fileSpec.suites).toEqual(["engineering", "release_gate"]);
    expect(fileSpec.sandboxPolicy.availablePermissionModes).toEqual(["guarded", "full_access"]);
  });

  test("accepts both deterministic and real-eval evidence bundles", () => {
    const deterministic = validationEvidenceBundleSchema.parse({
      validationRunId: "validation_run_1",
      scenarioId: "validation-deterministic",
      repoSource: {
        repoId: "repo-a",
        snapshot: "abc123",
        localPath: "/tmp/repo-a",
      },
      sandboxPolicy: {
        permissionMode: "guarded",
        networkMode: "off",
        writableRoots: ["workspace"],
        allowedCommandClasses: ["read"],
        escalationCommandClasses: ["destructive_shell"],
        destructiveActionPolicy: "ask",
      },
      taskPrompt: "repair deterministic scenario",
      sandboxRoot: "/tmp/sandbox-a",
      commandLog: [],
      approvalEvents: [],
      backendRefs: {
        kind: "deterministic_eval",
        suiteId: "core-eval-suite",
        scenarioRunId: "scenario_run_1",
      },
      verificationArtifacts: {},
      verdictExplanation: "deterministic evidence",
      artifactPaths: {
        artifactDir: "/tmp/sandbox-a",
        evidenceJsonPath: "/tmp/sandbox-a/evidence.json",
        verdictJsonPath: "/tmp/sandbox-a/verdict.json",
      },
    });

    const real = validationEvidenceBundleSchema.parse({
      validationRunId: "validation_run_2",
      scenarioId: "validation-real",
      repoSource: {
        repoId: "repo-b",
        snapshot: "def456",
        localPath: "/tmp/repo-b",
      },
      sandboxPolicy: {
        permissionMode: "full_access",
        networkMode: "restricted",
        writableRoots: ["workspace"],
        allowedCommandClasses: ["read", "write", "test"],
        escalationCommandClasses: [],
        destructiveActionPolicy: "allow",
      },
      taskPrompt: "repair real scenario",
      sandboxRoot: "/tmp/sandbox-b",
      commandLog: [],
      approvalEvents: [],
      backendRefs: {
        kind: "real_eval",
        suiteId: "real-eval-suite",
        scenarioId: "approval-gated-bugfix-loop",
        tracePath: "/tmp/sandbox-b/trace.json",
      },
      verificationArtifacts: {
        testOutput: "17 pass",
      },
      verdictExplanation: "real evidence",
      artifactPaths: {
        artifactDir: "/tmp/sandbox-b",
        evidenceJsonPath: "/tmp/sandbox-b/evidence.json",
        verdictJsonPath: "/tmp/sandbox-b/verdict.json",
        engineeringReportPath: "/tmp/sandbox-b/engineering.txt",
        productGateReportPath: "/tmp/sandbox-b/product-gate.txt",
      },
    });

    expect(deterministic.backendRefs.kind).toBe("deterministic_eval");
    expect(real.backendRefs.kind).toBe("real_eval");
  });

  test("requires outcome, trajectory, and control verdict dimensions", () => {
    expect(() =>
      validationVerdictSchema.parse({
        validationRunId: "validation_run_missing",
        scenarioId: "scenario",
        status: "passed",
        dimensions: {
          outcome: {
            status: "passed",
            score: 1,
            reason: "done",
          },
          trajectory: {
            status: "passed",
            score: 1,
            reason: "stable",
          },
        },
        capabilityScores: [],
        aggregateScore: 1,
        releaseGate: {
          blocked: false,
          blockingFamilies: [],
        },
        repairRecommendations: [],
      }),
    ).toThrow();
  });

  test("renders engineering and product gate views from the same suite summary", () => {
    const summary = validationSuiteSummarySchema.parse({
      validationSuiteRunId: "validation_suite_1",
      status: "failed",
      scenarioVerdicts: [],
      familyScores: [
        {
          family: "approval_control",
          score: 0.4,
          threshold: 0.8,
          blocking: true,
        },
      ],
      aggregateScore: 0.75,
      releaseGate: {
        blocked: true,
        blockingFamilies: ["approval_control"],
      },
      reviewQueueCount: 1,
      repairRecommendations: [],
    });

    const engineering = renderValidationEngineeringView(summary);
    const product = renderValidationProductGateView(summary);

    expect(engineering).toContain("Validation engineering view");
    expect(engineering).toContain("approval_control");
    expect(product).toContain("Validation product gate");
    expect(product).toContain("blocked=true");
  });
});
