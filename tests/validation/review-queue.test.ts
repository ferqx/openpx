import { describe, expect, test } from "bun:test";
import { SqliteEvalStore } from "../../src/persistence/sqlite/sqlite-eval-store";
import { createValidationReviewRecords, listPersistedValidationReviewRecords, persistValidationReviewRecords } from "../../src/validation/review-queue";
import type { ValidationRepairRecommendation, ValidationScenarioVerdictRecord } from "../../src/validation/validation-schema";

function createRepairRecommendation(): ValidationRepairRecommendation {
  return {
    recommendationId: "repair_1",
    validationRunId: "validation_run_1",
    scenarioId: "validation-scenario",
    failureClass: "approval_control_failure",
    rootCauseLayer: "approval_runtime",
    impactedObject: "run:run_1",
    severity: "high",
    confidence: 0.9,
    repairPath: "Restore approval routing before execution resumes.",
    evidenceRefs: ["evidence:/tmp/evidence.json"],
  };
}

function createScenarioVerdictRecord(): ValidationScenarioVerdictRecord {
  return {
    scenario: {
      id: "validation-scenario",
      summary: "validation scenario",
      taskPrompt: "repair the task",
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
      taskFamily: {
        primary: "approval_control",
        secondary: [],
      },
      scoringProfile: {
        outcomeWeight: 0.4,
        trajectoryWeight: 0.3,
        controlWeight: 0.3,
      },
      backend: {
        kind: "deterministic_eval",
        suiteId: "core-eval-suite",
        scenarioId: "approval-required-then-approved",
      },
      acceptanceChecks: [],
    },
    evidence: {
      validationRunId: "validation_run_1",
      scenarioId: "validation-scenario",
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
      taskPrompt: "repair the task",
      sandboxRoot: "/tmp/sandbox-a",
      commandLog: [],
      approvalEvents: [],
      backendRefs: {
        kind: "deterministic_eval",
        suiteId: "core-eval-suite",
        scenarioRunId: "scenario_run_1",
      },
      verificationArtifacts: {},
      verdictExplanation: "failed because approval path drifted",
      postRunAnalyzers: [],
      artifactPaths: {
        artifactDir: "/tmp/sandbox-a",
        evidenceJsonPath: "/tmp/sandbox-a/evidence.json",
        verdictJsonPath: "/tmp/sandbox-a/verdict.json",
        engineeringReportPath: "/tmp/sandbox-a/engineering.txt",
        productGateReportPath: "/tmp/sandbox-a/product-gate.txt",
      },
    },
    verdict: {
      validationRunId: "validation_run_1",
      scenarioId: "validation-scenario",
      status: "failed",
      dimensions: {
        outcome: {
          status: "failed",
          score: 0.3,
          reason: "task failed",
        },
        trajectory: {
          status: "failed",
          score: 0.2,
          reason: "trajectory drifted",
        },
        control: {
          status: "failed",
          score: 0.1,
          reason: "approval bypass",
        },
      },
      capabilityScores: [
        {
          family: "approval_control",
          score: 0.2,
          threshold: 0.8,
          blocking: true,
        },
      ],
      aggregateScore: 0.2,
      releaseGate: {
        blocked: true,
        blockingFamilies: ["approval_control"],
      },
      repairRecommendations: [createRepairRecommendation()],
    },
  };
}

describe("validation review queue", () => {
  test("persists validation-originated review metadata with evidence and gate references", async () => {
    const store = new SqliteEvalStore(":memory:");
    const record = createScenarioVerdictRecord();

    const created = createValidationReviewRecords({
      validationSuiteRunId: "validation_suite_1",
      scenarioVerdict: record,
      createdAt: "2026-04-12T00:00:00.000Z",
    });
    expect(created).toHaveLength(1);
    expect(created[0]?.metadataJson).toContain("\"lane\":\"validation\"");
    expect(created[0]?.metadataJson).toContain("\"validationSuiteRunId\":\"validation_suite_1\"");
    expect(created[0]?.metadataJson).toContain("\"permissionMode\":\"guarded\"");
    expect(created[0]?.metadataJson).toContain("\"repairRecommendationId\":\"repair_1\"");
    expect(created[0]?.metadataJson).toContain("\"contributedToBlockingFamily\":true");

    await persistValidationReviewRecords({
      store,
      validationSuiteRunId: "validation_suite_1",
      scenarioVerdict: record,
      createdAt: "2026-04-12T00:00:00.000Z",
    });

    const persisted = await listPersistedValidationReviewRecords({
      store,
      scenarioId: "validation-scenario",
    });

    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.validationSuiteRunId).toBe("validation_suite_1");
    expect(persisted[0]?.validationRunId).toBe("validation_run_1");
    expect(persisted[0]?.permissionMode).toBe("guarded");
    expect(persisted[0]?.repairRecommendationId).toBe("repair_1");
    expect(persisted[0]?.evidenceBundlePath).toBe("/tmp/sandbox-a/evidence.json");
    expect(persisted[0]?.scenarioArtifactDir).toBe("/tmp/sandbox-a");
    expect(persisted[0]?.engineeringReportPath).toBe("/tmp/sandbox-a/engineering.txt");
    expect(persisted[0]?.productGateReportPath).toBe("/tmp/sandbox-a/product-gate.txt");
    expect(persisted[0]?.contributedToBlockingFamily).toBe(true);
    await store.close();
  });
});
