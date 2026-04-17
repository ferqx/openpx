import { describe, expect, test } from "bun:test";
import {
  validationArtifactPathsSchema,
  validationAnalyzerVerdictSchema,
  validationEvidenceBundleSchema,
  validationPermissionModeSchema,
  validationScenarioFileSpecSchema,
  validationScenarioSpecSchema,
  validationSuiteSummarySchema,
  validationVerdictSchema,
  validationViewSchema,
} from "../../src/validation/validation-schema";
import {
  renderValidationEngineeringView,
  renderValidationProductGateView,
  renderValidationScorecardView,
} from "../../src/validation/reporting";

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

  test("accepts scorecard as a stable validation view", () => {
    expect(validationViewSchema.parse("scorecard")).toBe("scorecard");
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
      postRunAnalyzers: [
        validationAnalyzerVerdictSchema.parse({
          analyzerId: "truth_diff",
          status: "passed",
          reason: "truth and projection are aligned",
          evidenceRefs: ["artifact:/tmp/sandbox-a/truth-diff.json"],
        }),
      ],
      artifactPaths: {
        artifactDir: "/tmp/sandbox-a",
        evidenceJsonPath: "/tmp/sandbox-a/evidence.json",
        verdictJsonPath: "/tmp/sandbox-a/verdict.json",
        replayJsonPath: "/tmp/sandbox-a/replay.json",
        replayMarkdownPath: "/tmp/sandbox-a/replay.md",
        truthDiffJsonPath: "/tmp/sandbox-a/truth-diff.json",
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
      postRunAnalyzers: [
        validationAnalyzerVerdictSchema.parse({
          analyzerId: "failure_report",
          status: "suspicious",
          reason: "real trace needs manual inspection",
          evidenceRefs: ["artifact:/tmp/sandbox-b/failure.json"],
        }),
      ],
      artifactPaths: {
        artifactDir: "/tmp/sandbox-b",
        evidenceJsonPath: "/tmp/sandbox-b/evidence.json",
        verdictJsonPath: "/tmp/sandbox-b/verdict.json",
        engineeringReportPath: "/tmp/sandbox-b/engineering.txt",
        productGateReportPath: "/tmp/sandbox-b/product-gate.txt",
        replayJsonPath: "/tmp/sandbox-b/replay.json",
        replayMarkdownPath: "/tmp/sandbox-b/replay.md",
        failureJsonPath: "/tmp/sandbox-b/failure.json",
        failureMarkdownPath: "/tmp/sandbox-b/failure.md",
        truthDiffJsonPath: "/tmp/sandbox-b/truth-diff.json",
      },
    });

    expect(deterministic.backendRefs.kind).toBe("deterministic_eval");
    expect(real.backendRefs.kind).toBe("real_eval");
  });

  test("parses analyzer-rich artifact paths for replay/failure/scorecard outputs", () => {
    const artifactPaths = validationArtifactPathsSchema.parse({
      artifactDir: "/tmp/validation-suite",
      summaryJsonPath: "/tmp/validation-suite/summary.json",
      engineeringReportPath: "/tmp/validation-suite/engineering.txt",
      productGateReportPath: "/tmp/validation-suite/product-gate.txt",
      replayJsonPath: "/tmp/reports/replay/replay-run.json",
      replayMarkdownPath: "/tmp/reports/replay/replay-run.md",
      failureJsonPath: "/tmp/reports/failures/failure-run.json",
      failureMarkdownPath: "/tmp/reports/failures/failure-run.md",
      truthDiffJsonPath: "/tmp/reports/replay/truth-diff-run.json",
      scorecardJsonPath: "/tmp/reports/scorecards/scorecard.json",
      scorecardMarkdownPath: "/tmp/reports/scorecards/scorecard.md",
    });

    expect(artifactPaths.scorecardJsonPath).toContain("scorecard");
    expect(artifactPaths.replayMarkdownPath).toContain("replay");
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
      analyzerCoverage: {
        replayCoverage: 1,
        failureReportCoverage: 0.5,
        truthDiffCoverage: 1,
        loopEventCoverage: 0.75,
      },
      scorecard: {
        generatedAt: "2026-04-16T00:00:00.000Z",
        overallStatus: "failed",
        runtimeCorrectness: {
          coreScenarioSuccessRate: 0.5,
          approvalResumeSuccessRate: 0.5,
          cancelCorrectnessRate: 1,
          humanRecoveryCorrectnessRate: 1,
        },
        observabilityCoverage: {
          replayCoverage: 1,
          failureReportCoverage: 0.5,
          truthDiffCoverage: 1,
          loopEventCoverage: 0.75,
        },
        gate: {
          blocked: true,
          blockingFamilies: ["approval_control"],
        },
      },
    });

    const engineering = renderValidationEngineeringView(summary);
    const product = renderValidationProductGateView(summary);
    const scorecard = renderValidationScorecardView(summary);

    expect(engineering).toContain("Validation engineering view");
    expect(engineering).toContain("approval_control");
    expect(product).toContain("Validation product gate");
    expect(product).toContain("blocked=true");
    expect(scorecard).toContain("Validation confidence scorecard");
    expect(scorecard).toContain("coreScenarioSuccessRate");
  });
});
