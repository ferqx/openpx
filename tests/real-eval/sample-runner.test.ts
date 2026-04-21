import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ModelGateway } from "../../src/infra/model-gateway";
import { evalComparableRunSchema } from "../../src/eval/eval-schema";
import { findRealEvalScenario, realEvalScenarios } from "../../src/harness/eval/real/scenarios";
import { runRealSample } from "../../src/harness/eval/real/sample-runner";
import { buildRealRunTrace } from "../../src/harness/eval/real/trace";
import { inspectRealSampleTrace, loadStoredRealSample, replayStoredRealSampleEvaluation } from "../../src/harness/eval/real/replay";
import { removeWithRetry } from "../helpers/fs-cleanup";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => removeWithRetry(dir, { recursive: true, force: true })));
});

async function createTempDir(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function createDeterministicModelGateway(): ModelGateway {
  return {
    async plan(input) {
      const normalizedPrompt = input.prompt.toLowerCase();
      const isSafeContinuation = normalizedPrompt.includes("continue safely");
      const isRecoveryTask = normalizedPrompt.includes("recovery");
      const isArtifactTask = normalizedPrompt.includes("artifact");
      const isBoundedRecovery = normalizedPrompt.includes("bounded");
      return {
        summary: isSafeContinuation
          ? "plan continue safely"
          : isRecoveryTask
            ? "plan recovery flow"
            : isArtifactTask
              ? "plan artifact generation"
              : "plan delete approval target",
        plannerResult: {
          workPackages: [
            {
              id: isSafeContinuation
                ? "pkg_safe_replan"
                : isRecoveryTask
                  ? (isBoundedRecovery ? "pkg_resume_bounded" : "pkg_resume_complete")
                  : isArtifactTask
                    ? "pkg_artifact_current"
                    : "pkg_delete",
              objective: isSafeContinuation
                ? "continue safely without deleting files"
                : isRecoveryTask
                  ? "finish recovery task after resume"
                  : isArtifactTask
                    ? "generate artifact for the current package"
                    : "delete src/approval-target.ts",
              capabilityMarker: isSafeContinuation
                ? "respond_only"
                : isRecoveryTask
                  ? "respond_only"
                  : isArtifactTask
                    ? "respond_only"
                    : "apply_patch.delete_file",
              capabilityFamily: isSafeContinuation
                ? "reject_replan_delete"
                : isRecoveryTask
                  ? "interrupt_resume_recovery"
                  : isArtifactTask
                    ? "artifact_current_package"
                    : "approval_gated_delete",
              requiresApproval: !isSafeContinuation && !isRecoveryTask && !isArtifactTask,
              allowedTools: isArtifactTask || isSafeContinuation || isRecoveryTask ? [] : ["apply_patch"],
              inputRefs: isArtifactTask
                ? ["thread:goal", "file:src/artifact-current.ts", "file:src/artifact-legacy.ts"]
                : isSafeContinuation
                  ? ["thread:goal"]
                  : isRecoveryTask
                    ? ["thread:goal"]
                    : ["thread:goal", "file:src/approval-target.ts"],
              expectedArtifacts: isArtifactTask ? ["answer:artifact-current"] : isSafeContinuation || isRecoveryTask ? [] : ["patch:src/approval-target.ts"],
            },
          ],
          acceptanceCriteria: isSafeContinuation
            ? ["continue without risky file deletion"]
            : isRecoveryTask
              ? ["recovery task remains consistent after resume"]
              : isArtifactTask
                ? ["artifact points at the current package"]
                : ["src/approval-target.ts is removed"],
          riskFlags: [],
          approvalRequiredActions: isSafeContinuation || isRecoveryTask || isArtifactTask ? [] : ["apply_patch.delete_file"],
          verificationScope: ["workspace file state"],
        },
      };
    },
    async execute() {
      return { summary: "no executor tool calls", toolCalls: [] };
    },
    async verify() {
      return { summary: "verified", isValid: true };
    },
    async respond(input) {
      const prompt = input.prompt.toLowerCase();
      if (prompt.includes("continue safely without deleting files")) {
        return { summary: "continue safely without deleting files" };
      }
      if (prompt.includes("artifact-current.ts")) {
        return { summary: "artifact-current.ts belongs to the current package" };
      }
      if (prompt.includes("recovery task")) {
        return { summary: "Recovered cleanly after restart" };
      }
      return { summary: "Deleted src/approval-target.ts" };
    },
    onStatusChange() {
      return () => undefined;
    },
    onEvent() {
      return () => undefined;
    },
  };
}

function createDelayedDeterministicModelGateway(delayMs: number): ModelGateway {
  return {
    async plan(input) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const normalizedPrompt = input.prompt.toLowerCase();
      const isRecoveryTask = normalizedPrompt.includes("recovery");
      const isBoundedRecovery = normalizedPrompt.includes("bounded");
      return {
        summary: isRecoveryTask ? "plan recovery flow" : "plan delete approval target",
        plannerResult: {
          workPackages: [
            {
              id: isRecoveryTask ? (isBoundedRecovery ? "pkg_resume_bounded" : "pkg_resume_complete") : "pkg_delete",
              objective: isRecoveryTask ? "finish recovery task after resume" : "delete src/approval-target.ts",
              capabilityMarker: isRecoveryTask ? "respond_only" : "apply_patch.delete_file",
              capabilityFamily: isRecoveryTask ? "interrupt_resume_recovery" : "approval_gated_delete",
              requiresApproval: isRecoveryTask ? false : true,
              allowedTools: isRecoveryTask ? [] : ["apply_patch"],
              inputRefs: ["thread:goal"],
              expectedArtifacts: isRecoveryTask ? [] : ["patch:src/approval-target.ts"],
            },
          ],
          acceptanceCriteria: isRecoveryTask ? ["recovery task remains consistent after resume"] : ["src/approval-target.ts is removed"],
          riskFlags: [],
          approvalRequiredActions: isRecoveryTask ? [] : ["apply_patch.delete_file"],
          verificationScope: ["workspace file state"],
        },
      };
    },
    async execute() {
      return { summary: "no executor tool calls", toolCalls: [] };
    },
    async verify() {
      return { summary: "verified", isValid: true };
    },
    async respond(input) {
      const prompt = input.prompt.toLowerCase();
      if (prompt.includes("recovery task")) {
        return { summary: "Recovered cleanly after restart" };
      }
      return { summary: "Deleted src/approval-target.ts" };
    },
    onStatusChange() {
      return () => undefined;
    },
    onEvent() {
      return () => undefined;
    },
  };
}

describe("real sample runner", () => {
  test("runs one approval-gated real sample and persists a replayable minimal trace", async () => {
    const scenario = findRealEvalScenario("approval-gated-bugfix-loop");
    if (!scenario) {
      throw new Error("approval-gated-bugfix-loop scenario missing");
    }

    const rootDir = await createTempDir("openpx-real-sample-");
    const sample = await runRealSample({
      scenario,
      rootDir,
      dataDir: path.join(rootDir, "eval.sqlite"),
      createModelGateway: () => createDeterministicModelGateway(),
    });

    expect(sample.scenarioId).toBe("approval-gated-bugfix-loop");
    expect(sample.threadId).toMatch(/^thread_/);
    expect(sample.runId).toMatch(/^run_/);
    expect(sample.taskId).toMatch(/^task_/);
    expect(sample.status).toBe("completed");
    expect(sample.trace.scenarioId).toBe("approval-gated-bugfix-loop");
    expect(sample.trace.promptVariantId).toBe("canonical");
    expect(sample.trace.capabilityFamily).toBe("approval_gated_delete");
    expect(sample.trace.plannerEvidence.normalizedCapabilityMarker).toBe("apply_patch.delete_file");
    expect(sample.trace.approvalPathEvidence.approvalRequestObserved).toBe(true);
    expect(sample.trace.threadId).toBe(sample.threadId);
    expect(sample.trace.runId).toBe(sample.runId);
    expect(sample.trace.taskId).toBe(sample.taskId);
    expect(sample.trace.artifactContext).toEqual({
      currentWorkPackageId: "pkg_delete",
      previousWorkPackageIds: [],
      visibleStateWorkPackageId: "pkg_delete",
      generatedArtifactPath: "src/approval-target.ts",
      generatedArtifactWorkPackageId: "pkg_delete",
    });
    expect(sample.trace.milestones.map((milestone) => milestone.kind)).toEqual([
      "approval_requested",
      "approval_resolved",
      "resume_boundary",
      "side_effect",
      "terminal",
    ]);

    const targetPath = path.join(sample.workspaceRoot, "src", "approval-target.ts");
    expect(await Bun.file(targetPath).exists()).toBe(false);

    const loaded = await loadStoredRealSample(sample.artifactsDir);
    expect(loaded.summary.tracePath).toBe(sample.tracePath);
    expect(loaded.trace).toEqual(sample.trace);
    expect(inspectRealSampleTrace(loaded.trace)).toEqual({
      scenarioId: "approval-gated-bugfix-loop",
      promptVariantId: "canonical",
      threadId: sample.threadId,
      runId: sample.runId,
      taskId: sample.taskId,
      milestoneKinds: ["approval_requested", "approval_resolved", "resume_boundary", "side_effect", "terminal"],
      pendingApprovalCount: 0,
      unknownAfterCrashCount: 0,
    });

    const movedArtifactsDir = await createTempDir("openpx-real-sample-moved-");
    await fs.cp(sample.artifactsDir, movedArtifactsDir, { recursive: true });
    const movedLoaded = await loadStoredRealSample(movedArtifactsDir);
    expect(movedLoaded.trace).toEqual(sample.trace);
    expect(movedLoaded.summary.tracePath).toBe(path.join(movedArtifactsDir, "trace.json"));

    await removeWithRetry(sample.workspaceRoot, { recursive: true, force: true });
    await removeWithRetry(path.join(rootDir, "eval.sqlite"), { force: true });
    await removeWithRetry(path.join(rootDir, "eval.sqlite-wal"), { force: true });
    await removeWithRetry(path.join(rootDir, "eval.sqlite-shm"), { force: true });

    const replayed = await replayStoredRealSampleEvaluation(movedArtifactsDir);
    expect(replayed.trace.scenarioId).toBe("approval-gated-bugfix-loop");
    expect(replayed.scenario.id).toBe("approval-gated-bugfix-loop");
    expect(replayed.scenario.expectedOutcome.expectedApprovalCount).toBe(1);
    expect(replayed.outcomeResults.every((result) => result.status === "passed")).toBe(true);
    expect(replayed.trajectoryResults.every((result) => result.status === "passed")).toBe(true);
    expect(replayed.outcomeResults.map((result) => result.id)).toContain("outcome.terminal_run_status");
    expect(replayed.trajectoryResults.map((result) => result.id)).toContain("trajectory.approval_resolution");
  });

  test("runs alternate prompt variants that preserve the same capability family", async () => {
    const scenario = findRealEvalScenario("approval-gated-bugfix-loop");
    if (!scenario) {
      throw new Error("approval-gated-bugfix-loop scenario missing");
    }

    const canonicalRootDir = await createTempDir("openpx-real-sample-canonical-");
    const canonical = await runRealSample({
      scenario,
      rootDir: canonicalRootDir,
      dataDir: path.join(canonicalRootDir, "eval.sqlite"),
      createModelGateway: () => createDeterministicModelGateway(),
    });

    const politeRootDir = await createTempDir("openpx-real-sample-polite-");
    const polite = await runRealSample({
      scenario,
      promptVariantId: "polite",
      rootDir: politeRootDir,
      dataDir: path.join(politeRootDir, "eval.sqlite"),
      createModelGateway: () => createDeterministicModelGateway(),
    });

    expect(canonical.trace.capabilityFamily).toBe("approval_gated_delete");
    expect(polite.trace.capabilityFamily).toBe("approval_gated_delete");
    expect(canonical.trace.promptVariantId).toBe("canonical");
    expect(polite.trace.promptVariantId).toBe("polite");
    expect(canonical.trace.canonicalExpectedIntent).toEqual(polite.trace.canonicalExpectedIntent);
    expect(canonical.trace.plannerEvidence.normalizedCapabilityMarker).toBe("apply_patch.delete_file");
    expect(polite.trace.plannerEvidence.normalizedCapabilityMarker).toBe("apply_patch.delete_file");
  });

  test("allows real-sample planning to exceed the old 1500ms timeout window", async () => {
    const scenario = findRealEvalScenario("approval-gated-bugfix-loop");
    if (!scenario) {
      throw new Error("approval-gated-bugfix-loop scenario missing");
    }

    const rootDir = await createTempDir("openpx-real-sample-delayed-");
    const sample = await runRealSample({
      scenario,
      rootDir,
      dataDir: path.join(rootDir, "eval.sqlite"),
      createModelGateway: () => createDelayedDeterministicModelGateway(600),
    });

    expect(sample.status).toBe("completed");
    expect(sample.trace.approvalPathEvidence.approvalRequestObserved).toBe(true);
  });

  test("runs an artifact-ownership real sample and keeps the artifact scoped to the current work package", async () => {
    const scenario = findRealEvalScenario("artifact-current-package-loop");
    if (!scenario) {
      throw new Error("artifact-current-package-loop scenario missing");
    }

    const rootDir = await createTempDir("openpx-real-sample-artifact-");
    const sample = await runRealSample({
      scenario,
      rootDir,
      dataDir: path.join(rootDir, "eval.sqlite"),
      createModelGateway: () => createDeterministicModelGateway(),
    });

    expect(sample.status).toBe("completed");
    expect(sample.trace.scenarioId).toBe("artifact-current-package-loop");
    expect(sample.trace.capabilityFamily).toBe("artifact_current_package");
    expect(sample.trace.artifactContext).toEqual({
      currentWorkPackageId: "pkg_artifact_current",
      previousWorkPackageIds: ["pkg_artifact_legacy"],
      visibleStateWorkPackageId: "pkg_artifact_current",
      generatedArtifactPath: "src/artifact-current.ts",
      generatedArtifactWorkPackageId: "pkg_artifact_current",
    });
    expect(sample.trace.milestones.map((milestone) => milestone.kind)).toEqual([
      "side_effect",
      "terminal",
    ]);
  });

  test("runs interrupt-resume live samples through a completion resume path", async () => {
    const scenario = findRealEvalScenario("interrupt-resume-work-loop");
    if (!scenario) {
      throw new Error("interrupt-resume-work-loop scenario missing");
    }

    const rootDir = await createTempDir("openpx-real-sample-interrupt-complete-");
    const sample = await runRealSample({
      scenario,
      rootDir,
      dataDir: path.join(rootDir, "eval.sqlite"),
      createModelGateway: () => createDelayedDeterministicModelGateway(1700),
    });

    expect(sample.status).toBe("completed");
    expect(sample.trace.scenarioId).toBe("interrupt-resume-work-loop");
    expect(sample.trace.promptVariantId).toBe("complete-after-resume");
    expect(sample.trace.capabilityFamily).toBe("interrupt_resume_recovery");
    expect(sample.trace.milestones.map((milestone) => milestone.kind)).toEqual([
      "recovery_boundary",
      "resume_boundary",
      "terminal",
    ]);
    expect(sample.trace.comparable.terminalOutcome.latestRunStatus).toBe("completed");
    expect(sample.trace.comparable.sideEffects.duplicateCompletedToolCallAliases).toEqual([]);
  });

  test("captures rejection and recovery milestones in the minimal trace shape", () => {
    const comparable = evalComparableRunSchema.parse({
      runtimeRefs: {
        threadId: "thread_trace",
        runs: {
          run_1: "run_trace",
          run_2: "run_resume",
        },
        tasks: {
          task_1: "task_trace",
        },
        approvals: {
          approval_1: "approval_trace",
        },
        toolCalls: {
          tool_call_1: "tool_trace",
        },
      },
      terminalOutcome: {
        threadStatus: "active",
        latestRunAlias: "run_2",
        latestRunStatus: "completed",
        latestTaskAlias: "task_1",
        latestTaskStatus: "blocked",
        pendingApprovalCount: 0,
        summary: "Recovered after rejection and resume",
      },
      runLineage: [
        {
          alias: "run_1",
          trigger: "user_input",
          status: "waiting_approval",
          activeTaskAlias: "task_1",
          blockingKind: "waiting_approval",
          inputText: "delete src/approval-target.ts",
        },
        {
          alias: "run_2",
          trigger: "system_resume",
          status: "completed",
          activeTaskAlias: "task_1",
          summary: "Recovered after rejection and resume",
        },
      ],
      taskLineage: [
        {
          alias: "task_1",
          runAlias: "run_1",
          status: "blocked",
          summary: "delete src/approval-target.ts",
          blockingKind: "human_recovery",
        },
      ],
      approvalFlow: {
        requested: [
          {
            alias: "approval_1",
            runAlias: "run_1",
            taskAlias: "task_1",
            status: "rejected",
            summary: "Delete src/approval-target.ts",
            toolName: "apply_patch",
            action: "delete_file",
          },
        ],
        resolution: "rejected",
        graphResumeDetected: true,
        rejectionReason: "Use a safer path",
        reroutedToPlanner: true,
      },
      recoveryFlow: {
        humanRecoveryTriggered: true,
        uncertainExecutionCount: 1,
        blockedTaskAliases: ["task_1"],
        interruptedRunAliases: [],
        resumedRunAliases: ["run_2"],
      },
      sideEffects: {
        totalEntries: 1,
        unknownAfterCrashCount: 1,
        completedEntries: [
          {
            taskAlias: "task_1",
            runAlias: "run_2",
            toolCallAlias: "tool_call_1",
            toolName: "apply_patch",
            status: "completed",
          },
        ],
        duplicateCompletedToolCallAliases: [],
      },
      eventMilestones: {
        eventTypes: ["task.updated", "thread.blocked", "tool.executed"],
        toolExecutedCount: 1,
        toolFailedCount: 0,
        threadBlockedCount: 1,
        taskCompletedCount: 0,
        taskFailedCount: 0,
        taskUpdatedBlockedCount: 1,
      },
    });

    const trace = buildRealRunTrace({
      scenarioId: "reject-and-replan-task-loop",
      promptVariantId: "constraint",
      capabilityFamily: "reject_replan_delete",
      userGoal: "keep working after a rejected proposal",
      plannerEvidence: {
        summary: "normalized to delete capability",
        normalizedObjective: "delete src/approval-target.ts",
        normalizedCapabilityMarker: "apply_patch.delete_file",
        approvalRequiredActions: ["apply_patch.delete_file"],
      },
      approvalPathEvidence: {
        approvalRequestObserved: true,
        terminalMode: "completed",
        blockingReasonKind: "human_recovery",
      },
      threadId: "thread_trace",
      runId: "run_resume",
      taskId: "task_trace",
      canonicalExpectedIntent: {
        capabilityFamily: "reject_replan_delete",
        toolName: "apply_patch",
        action: "delete_file",
      },
      artifactContext: {
        currentWorkPackageId: "pkg_safe_replan",
        previousWorkPackageIds: ["pkg_delete"],
        generatedArtifactPath: "src/approval-target.ts",
        generatedArtifactWorkPackageId: "pkg_safe_replan",
      },
      comparable,
    });

    expect(trace.milestones.map((milestone) => milestone.kind)).toEqual([
      "approval_requested",
      "approval_resolved",
      "replan_entry",
      "recovery_boundary",
      "resume_boundary",
      "side_effect",
      "terminal",
    ]);
    expect(trace.rejectionReason).toBe("Use a safer path");
    expect(trace.promptVariantId).toBe("constraint");
    expect(trace.capabilityFamily).toBe("reject_replan_delete");
    expect(trace.artifactContext?.generatedArtifactWorkPackageId).toBe("pkg_safe_replan");
    expect(trace.pendingApprovalCount).toBe(0);
    expect(trace.unknownAfterCrashCount).toBe(1);
  });

  test("freezes canonical scenario metadata deeply enough to protect expected summary includes", () => {
    const scenario = realEvalScenarios[0];
    if (!scenario) {
      throw new Error("expected at least one canonical scenario");
    }

    expect(Object.isFrozen(scenario)).toBe(true);
    expect(Object.isFrozen(scenario.expectedOutcome)).toBe(true);
    expect(Object.isFrozen(scenario.expectedOutcome.expectedSummaryIncludes)).toBe(true);
    expect(Object.isFrozen(scenario.promptVariants)).toBe(true);
    expect(() => scenario.expectedOutcome.expectedSummaryIncludes.push("mutated")).toThrow();
  });
});
