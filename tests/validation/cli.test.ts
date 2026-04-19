import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ValidationSuiteSummary } from "../../src/validation/validation-schema";
import { executeValidationSuiteCommand } from "../../src/validation/run-suite";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function createSummary(status: ValidationSuiteSummary["status"], blocked: boolean): ValidationSuiteSummary {
  return {
    validationSuiteRunId: "validation_suite_test",
    status,
    scenarioVerdicts: [],
    familyScores: [],
    aggregateScore: blocked ? 0.4 : 0.95,
    releaseGate: {
      blocked,
      blockingFamilies: blocked ? ["approval_control"] : [],
    },
    reviewQueueCount: blocked ? 1 : 0,
    repairRecommendations: [],
  };
}

describe("validation CLI", () => {
  test("runs a named suite successfully", async () => {
    const lines: string[] = [];
    const exitCode = await executeValidationSuiteCommand(
      ["--suite", "engineering"],
      {
        writeLine: (line) => {
          lines.push(line);
        },
        resolveSuiteScenarios: async () => [{
          id: "scenario-a",
          summary: "scenario-a",
          taskPrompt: "repair",
          repoSource: { repoId: "repo-a", snapshot: "workspace", localPath: "/tmp/repo-a" },
          sandboxPolicy: {
            permissionMode: "guarded",
            networkMode: "off",
            writableRoots: ["workspace"],
            allowedCommandClasses: ["read"],
            escalationCommandClasses: ["destructive_shell"],
            destructiveActionPolicy: "ask",
          },
          taskFamily: { primary: "approval_control", secondary: [] },
          scoringProfile: { outcomeWeight: 0.4, trajectoryWeight: 0.3, controlWeight: 0.3 },
          backend: { kind: "deterministic_eval", suiteId: "core-eval-suite", scenarioId: "approval-required-then-approved" },
          acceptanceChecks: [],
        }],
        runSuite: async () => createSummary("passed", false),
      },
    );

    expect(exitCode).toBe(0);
    expect(lines.join("\n")).toContain("Validation engineering view");
  });

  test("runs a single scenario successfully", async () => {
    const lines: string[] = [];
    const exitCode = await executeValidationSuiteCommand(
      ["--scenario", "scenario-a", "--view", "product_gate"],
      {
        writeLine: (line) => {
          lines.push(line);
        },
        findScenario: async () => ({
          id: "scenario-a",
          summary: "scenario-a",
          taskPrompt: "repair",
          repoSource: { repoId: "repo-a", snapshot: "workspace", localPath: "/tmp/repo-a" },
          sandboxPolicy: {
            permissionMode: "guarded",
            networkMode: "off",
            writableRoots: ["workspace"],
            allowedCommandClasses: ["read"],
            escalationCommandClasses: ["destructive_shell"],
            destructiveActionPolicy: "ask",
          },
          taskFamily: { primary: "approval_control", secondary: [] },
          scoringProfile: { outcomeWeight: 0.4, trajectoryWeight: 0.3, controlWeight: 0.3 },
          backend: { kind: "deterministic_eval", suiteId: "core-eval-suite", scenarioId: "approval-required-then-approved" },
          acceptanceChecks: [],
        }),
        runSuite: async () => createSummary("passed", false),
      },
    );

    expect(exitCode).toBe(0);
    expect(lines.join("\n")).toContain("Validation product gate");
  });

  test("returns a useful error for an invalid scenario id", async () => {
    const lines: string[] = [];
    const exitCode = await executeValidationSuiteCommand(
      ["--scenario", "missing-scenario"],
      {
        writeLine: (line) => {
          lines.push(line);
        },
        findScenario: async () => undefined,
      },
    );

    expect(exitCode).toBe(2);
    expect(lines.join("\n")).toContain("Unknown validation scenario: missing-scenario");
  });

  test("returns nonzero when the release gate blocks", async () => {
    const lines: string[] = [];
    const exitCode = await executeValidationSuiteCommand(
      ["--suite", "engineering", "--json"],
      {
        writeLine: (line) => {
          lines.push(line);
        },
        resolveSuiteScenarios: async () => [{
          id: "scenario-a",
          summary: "scenario-a",
          taskPrompt: "repair",
          repoSource: { repoId: "repo-a", snapshot: "workspace", localPath: "/tmp/repo-a" },
          sandboxPolicy: {
            permissionMode: "guarded",
            networkMode: "off",
            writableRoots: ["workspace"],
            allowedCommandClasses: ["read"],
            escalationCommandClasses: ["destructive_shell"],
            destructiveActionPolicy: "ask",
          },
          taskFamily: { primary: "approval_control", secondary: [] },
          scoringProfile: { outcomeWeight: 0.4, trajectoryWeight: 0.3, controlWeight: 0.3 },
          backend: { kind: "deterministic_eval", suiteId: "core-eval-suite", scenarioId: "approval-required-then-approved" },
          acceptanceChecks: [],
        }],
        runSuite: async () => createSummary("failed", true),
      },
    );

    expect(exitCode).toBe(1);
    expect(lines.join("\n")).toContain("\"blocked\":true");
  });

  test("renders scorecard view when requested", async () => {
    const lines: string[] = [];
    const exitCode = await executeValidationSuiteCommand(
      ["--suite", "engineering", "--view", "scorecard"],
      {
        writeLine: (line) => {
          lines.push(line);
        },
        resolveSuiteScenarios: async () => [{
          id: "scenario-a",
          summary: "scenario-a",
          taskPrompt: "repair",
          repoSource: { repoId: "repo-a", snapshot: "workspace", localPath: "/tmp/repo-a" },
          sandboxPolicy: {
            permissionMode: "guarded",
            networkMode: "off",
            writableRoots: ["workspace"],
            allowedCommandClasses: ["read"],
            escalationCommandClasses: ["destructive_shell"],
            destructiveActionPolicy: "ask",
          },
          taskFamily: { primary: "approval_control", secondary: [] },
          scoringProfile: { outcomeWeight: 0.4, trajectoryWeight: 0.3, controlWeight: 0.3 },
          backend: { kind: "deterministic_eval", suiteId: "core-eval-suite", scenarioId: "approval-required-then-approved" },
          acceptanceChecks: [],
        }],
        runSuite: async () => ({
          ...createSummary("passed", false),
          analyzerCoverage: {
            replayCoverage: 1,
            failureReportCoverage: 1,
            truthDiffCoverage: 1,
            loopEventCoverage: 1,
          },
          scorecard: {
            generatedAt: "2026-04-16T00:00:00.000Z",
            overallStatus: "passed",
            runtimeCorrectness: {
              coreScenarioSuccessRate: 1,
              approvalResumeSuccessRate: 1,
              cancelCorrectnessRate: 1,
              humanRecoveryCorrectnessRate: 1,
            },
            observabilityCoverage: {
              replayCoverage: 1,
              failureReportCoverage: 1,
              truthDiffCoverage: 1,
              loopEventCoverage: 1,
            },
            gate: {
              blocked: false,
              blockingFamilies: [],
            },
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(lines.join("\n")).toContain("Validation confidence scorecard");
  });
});
