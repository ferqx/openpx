import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ModelGateway } from "../../src/infra/model-gateway";
import { realRunTraceSchema, type RealRunTrace } from "../../src/harness/eval/real/real-eval-schema";
import { evaluateRealTrace } from "../../src/harness/eval/real/evaluation";
import { loadStoredRealSample } from "../../src/harness/eval/real/replay";
import { REAL_EVAL_SUITE_ID, realEvalScenarios } from "../../src/harness/eval/real/scenarios";
import { executeRealEvalSuiteCommand, runRealEvalSuite } from "../../src/harness/eval/real/suite-runner";
import { SqliteEvalStore } from "../../src/persistence/sqlite/sqlite-eval-store";
import { removeWithRetry } from "../helpers/fs-cleanup";

setDefaultTimeout(20000);

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
  let planCallCount = 0;

  return {
    async plan(input: { prompt: string }) {
      planCallCount += 1;
      const normalizedPrompt = input.prompt.toLowerCase();
      const isApprovalPlan = normalizedPrompt.includes("approval-target");
      const isArtifactPlan = normalizedPrompt.includes("artifact");
      const isRecoveryPlan = normalizedPrompt.includes("recovery");
      const isBoundedRecovery = normalizedPrompt.includes("bounded");
      const approvalPlan = isApprovalPlan && planCallCount === 1;

      return {
        summary: `model summary for: ${input.prompt}`,
        plannerResult: {
          workPackages: [
            {
              id: approvalPlan
                ? "pkg_delete"
                : isArtifactPlan
                  ? "pkg_artifact_current"
                  : isRecoveryPlan
                    ? (isBoundedRecovery ? "pkg_resume_bounded" : "pkg_resume_complete")
                    : "pkg_safe_replan",
              objective: approvalPlan
                ? "delete src/approval-target.ts"
                : isArtifactPlan
                  ? "generate artifact for the current package"
                  : isRecoveryPlan
                    ? "finish recovery task after resume"
                    : "continue safely without deleting files",
              capabilityMarker: approvalPlan ? "apply_patch.delete_file" : "respond_only",
              capabilityFamily: approvalPlan
                ? "approval_gated_delete"
                : isArtifactPlan
                  ? "artifact_current_package"
                  : isRecoveryPlan
                    ? "interrupt_resume_recovery"
                    : "reject_replan_delete",
              requiresApproval: approvalPlan,
              allowedTools: approvalPlan ? ["apply_patch"] : [],
              inputRefs: approvalPlan
                ? ["thread:goal", "file:src/approval-target.ts"]
                : isArtifactPlan
                  ? ["thread:goal", "file:src/artifact-current.ts", "file:src/artifact-legacy.ts"]
                  : ["thread:goal"],
              expectedArtifacts: approvalPlan ? ["patch:src/approval-target.ts"] : isArtifactPlan ? ["answer:artifact-current"] : [],
            },
          ],
          acceptanceCriteria: approvalPlan
            ? ["src/approval-target.ts is removed"]
            : isArtifactPlan
              ? ["artifact points at the current package"]
              : isRecoveryPlan
                ? ["recovery task remains consistent after resume"]
                : ["continue without risky file deletion"],
          riskFlags: [],
          approvalRequiredActions: approvalPlan ? ["apply_patch.delete_file"] : [],
          verificationScope: ["workspace file state"],
        },
      };
    },
    async verify() {
      return { summary: "verified", isValid: true };
    },
    async respond() {
      return { summary: "responded" };
    },
    onStatusChange() {
      return () => undefined;
    },
    onEvent() {
      return () => undefined;
    },
  };
}

function createApprovalTrace(): RealRunTrace {
  return realRunTraceSchema.parse({
    scenarioId: "approval-gated-bugfix-loop",
    promptVariantId: "canonical",
    capabilityFamily: "approval_gated_delete",
    userGoal: "repair approval target inside pkg_delete",
    plannerEvidence: {
      summary: "normalized to delete capability",
      normalizedObjective: "delete src/approval-target.ts",
      normalizedCapabilityMarker: "apply_patch.delete_file",
      approvalRequiredActions: ["apply_patch.delete_file"],
    },
    approvalPathEvidence: {
      approvalRequestObserved: true,
      terminalMode: "completed",
    },
    canonicalExpectedIntent: {
      capabilityFamily: "approval_gated_delete",
      toolName: "apply_patch",
      action: "delete_file",
    },
    threadId: "thread_real_eval",
    runId: "run_real_eval",
    taskId: "task_real_eval",
    summary: "Deleted src/approval-target.ts after returning to graph",
    artifactContext: {
      currentWorkPackageId: "pkg_delete",
      previousWorkPackageIds: [],
      visibleStateWorkPackageId: "pkg_delete",
      generatedArtifactPath: "src/approval-target.ts",
      generatedArtifactWorkPackageId: "pkg_delete",
    },
    pendingApprovalCount: 0,
    unknownAfterCrashCount: 0,
    milestones: [
      {
        kind: "approval_requested",
        approvalRequestId: "approval_1",
        summary: "apply_patch delete_file src/approval-target.ts",
        toolName: "apply_patch",
      },
      {
        kind: "approval_resolved",
        approvalRequestId: "approval_1",
        resolution: "approved",
        summary: "approval granted",
      },
      {
        kind: "resume_boundary",
        summary: "returned to graph",
      },
      {
        kind: "side_effect",
        summary: "apply_patch completed",
        toolName: "apply_patch",
      },
      {
        kind: "terminal",
        summary: "Deleted src/approval-target.ts after returning to graph",
      },
    ],
    comparable: {
      runtimeRefs: {
        threadId: "thread_real_eval",
        runs: {
          run_initial: "run_initial_id",
          run_active: "run_real_eval",
        },
        tasks: {
          task_active: "task_real_eval",
        },
        approvals: {
          approval_1: "approval_1",
        },
        toolCalls: {
          tool_call_1: "tool_call_1_id",
        },
      },
      terminalOutcome: {
        threadStatus: "active",
        latestRunAlias: "run_active",
        latestRunStatus: "completed",
        latestTaskAlias: "task_active",
        latestTaskStatus: "completed",
        pendingApprovalCount: 0,
        summary: "Deleted src/approval-target.ts after returning to graph",
      },
      runLineage: [
        {
          alias: "run_initial",
          trigger: "user_input",
          status: "waiting_approval",
          activeTaskAlias: "task_active",
          blockingKind: "waiting_approval",
          inputText: "repair approval target inside pkg_delete",
        },
        {
          alias: "run_active",
          trigger: "system_resume",
          status: "completed",
          activeTaskAlias: "task_active",
          summary: "Deleted src/approval-target.ts after returning to graph",
        },
      ],
      taskLineage: [
        {
          alias: "task_active",
          runAlias: "run_active",
          status: "completed",
          summary: "Apply artifact change for pkg_delete using src/approval-target.ts",
        },
      ],
      approvalFlow: {
        requested: [
          {
            alias: "approval_1",
            runAlias: "run_initial",
            taskAlias: "task_active",
            status: "approved",
            summary: "apply_patch delete_file src/approval-target.ts",
            toolName: "apply_patch",
            action: "delete_file",
          },
        ],
        resolution: "approved",
        graphResumeDetected: true,
        reroutedToPlanner: false,
      },
      recoveryFlow: {
        humanRecoveryTriggered: false,
        uncertainExecutionCount: 0,
        blockedTaskAliases: [],
        interruptedRunAliases: [],
        resumedRunAliases: ["run_active"],
      },
      sideEffects: {
        totalEntries: 1,
        unknownAfterCrashCount: 0,
        completedEntries: [
          {
            taskAlias: "task_active",
            runAlias: "run_active",
            toolCallAlias: "tool_call_1",
            toolName: "apply_patch",
            status: "completed",
          },
        ],
        duplicateCompletedToolCallAliases: [],
      },
      eventMilestones: {
        eventTypes: ["approval.requested", "approval.resolved", "tool.executed", "task.completed"],
        toolExecutedCount: 1,
        toolFailedCount: 0,
        threadBlockedCount: 0,
        taskCompletedCount: 1,
        taskFailedCount: 0,
        taskUpdatedBlockedCount: 0,
      },
    },
  });
}

describe("real eval runner", () => {
  test("registers a distinct suite id with runnable real-eval scenarios", () => {
    expect(REAL_EVAL_SUITE_ID).not.toBe("core-eval-suite");
    expect(realEvalScenarios).toHaveLength(4);
    expect(Object.isFrozen(realEvalScenarios)).toBe(true);
    expect(Object.isFrozen(realEvalScenarios[0] ?? {})).toBe(true);
    expect(realEvalScenarios.map((scenario) => scenario.id)).toEqual([
      "approval-gated-bugfix-loop",
      "reject-and-replan-task-loop",
      "artifact-current-package-loop",
      "interrupt-resume-work-loop",
    ]);
  });

  test("runs a single real-eval scenario through the live sample runner", async () => {
    const rootDir = await createTempDir("openpx-real-eval-suite-runner-one-");
    const dataDir = path.join(rootDir, "openpx.db");
    const runtimeRootDir = path.join(rootDir, "runtime");

    const summary = await runRealEvalSuite({
      suiteId: REAL_EVAL_SUITE_ID,
      scenarios: realEvalScenarios,
      scenarioId: "approval-gated-bugfix-loop",
      dataDir,
      rootDir: runtimeRootDir,
      createModelGateway: () => createDeterministicModelGateway(),
    });

    expect(summary.suiteId).toBe(REAL_EVAL_SUITE_ID);
    expect(summary.status).toBe("passed");
    expect(summary.exitCode).toBe(0);
    expect(summary.scenarioSummaries).toHaveLength(1);
    expect(summary.scenarioSummaries[0]?.scenarioId).toBe("approval-gated-bugfix-loop");
    expect(summary.scenarioSummaries[0]?.status).toBe("passed");
    expect(summary.scenarioSummaries[0]?.promptVariantId).toBe("canonical");
    expect(summary.scenarioSummaries[0]?.capabilityFamily).toBe("approval_gated_delete");
    expect(summary.evolutionCandidates).toEqual([]);
    expect(summary.promotionSummaries).toEqual([
      expect.objectContaining({
        capabilityFamily: "approval_gated_delete",
        promotionStatus: "ready_for_foundation_guard",
        promotionEvidence: {
          liveRealEvalPassed: true,
          deterministicRegressionPresent: true,
          runtimeRegressionPresent: true,
        },
      }),
    ]);
    expect(Object.hasOwn(summary.scenarioSummaries[0] ?? {}, "baseline")).toBe(false);
    expect(await Bun.file(path.join(runtimeRootDir, "approval-gated-bugfix-loop", "artifacts", "result.json")).exists()).toBe(true);
    expect(await Bun.file(path.join(runtimeRootDir, "approval-gated-bugfix-loop", "artifacts", "trace.json")).exists()).toBe(true);
  });

  test("executes a real sample, stores its trace artifact, and persists review records from evaluation", async () => {
    const rootDir = await createTempDir("openpx-real-eval-suite-real-run-");
    const dataDir = path.join(rootDir, "openpx.db");
    const runtimeRootDir = path.join(rootDir, "runtime");

    const summary = await runRealEvalSuite({
      suiteId: REAL_EVAL_SUITE_ID,
      scenarios: realEvalScenarios,
      scenarioId: "approval-gated-bugfix-loop",
      dataDir,
      rootDir: runtimeRootDir,
      createModelGateway: () => createDeterministicModelGateway(),
    });

    const artifactsDir = path.join(runtimeRootDir, "approval-gated-bugfix-loop", "artifacts");
    const tracePath = path.join(artifactsDir, "trace.json");
    const stored = await loadStoredRealSample(artifactsDir);
    const evaluation = evaluateRealTrace(stored.trace);
    const store = new SqliteEvalStore(dataDir);
    const reviewRecords = await store.listReviewRecords({ scenarioId: "approval-gated-bugfix-loop" });

    expect(summary.suiteId).toBe(REAL_EVAL_SUITE_ID);
    expect(summary.status).toBe(evaluation.status);
    expect(summary.exitCode).toBe(0);
    expect(summary.scenarioSummaries).toHaveLength(1);
    expect(summary.scenarioSummaries[0]?.scenarioId).toBe("approval-gated-bugfix-loop");
    expect(await Bun.file(tracePath).exists()).toBe(true);
    expect(stored.trace.scenarioId).toBe("approval-gated-bugfix-loop");
    expect(reviewRecords).toHaveLength(evaluation.reviewItems.length);
    expect(reviewRecords.every((record) => record.metadataJson?.includes("\"lane\":\"real-eval\""))).toBe(true);

    await store.close();
  });

  test("default suite run executes the full V0 live scenario set", async () => {
    const rootDir = await createTempDir("openpx-real-eval-suite-default-live-");
    const dataDir = path.join(rootDir, "openpx.db");
    const runtimeRootDir = path.join(rootDir, "runtime");

    const summary = await runRealEvalSuite({
      suiteId: REAL_EVAL_SUITE_ID,
      dataDir,
      rootDir: runtimeRootDir,
      createModelGateway: () => createDeterministicModelGateway(),
    });

    expect(summary.exitCode).toBe(0);
    expect(summary.scenarioSummaries.map((scenario) => scenario.scenarioId)).toEqual([
      "approval-gated-bugfix-loop",
      "reject-and-replan-task-loop",
      "artifact-current-package-loop",
      "interrupt-resume-work-loop",
    ]);
  });

  test("runs a selected prompt variant and records the variant id in the summary", async () => {
    const rootDir = await createTempDir("openpx-real-eval-suite-variant-");
    const dataDir = path.join(rootDir, "openpx.db");

    const summary = await runRealEvalSuite({
      suiteId: REAL_EVAL_SUITE_ID,
      scenarioId: "approval-gated-bugfix-loop",
      promptVariantId: "polite",
      rootDir,
      dataDir,
      createModelGateway: () => createDeterministicModelGateway(),
    });

    expect(summary.scenarioSummaries).toHaveLength(1);
    expect(summary.scenarioSummaries[0]?.promptVariantId).toBe("polite");
    expect(summary.scenarioSummaries[0]?.capabilityFamily).toBe("approval_gated_delete");
  });

  test("runs all prompt variants for a family when explicitly requested", async () => {
    const rootDir = await createTempDir("openpx-real-eval-suite-all-variants-");
    const dataDir = path.join(rootDir, "openpx.db");

    const summary = await runRealEvalSuite({
      suiteId: REAL_EVAL_SUITE_ID,
      scenarioId: "approval-gated-bugfix-loop",
      allVariants: true,
      rootDir,
      dataDir,
      createModelGateway: () => createDeterministicModelGateway(),
    });

    expect(summary.scenarioSummaries.length).toBeGreaterThan(1);
    expect(summary.scenarioSummaries.map((scenario) => scenario.promptVariantId)).toEqual([
      "canonical",
      "polite",
      "constraint",
    ]);
    expect(summary.scenarioSummaries.every((scenario) => scenario.capabilityFamily === "approval_gated_delete")).toBe(true);
  });

  test("fails fast when a requested scenario is not in the provided suite subset", async () => {
    const rootDir = await createTempDir("openpx-real-eval-suite-bounds-");

    await expect(
      runRealEvalSuite({
        suiteId: REAL_EVAL_SUITE_ID,
        scenarios: [realEvalScenarios[0]!],
        scenarioId: "reject-and-replan-task-loop",
        rootDir: path.join(rootDir, "runtime"),
        dataDir: path.join(rootDir, "openpx.db"),
      }),
    ).rejects.toThrow("Unknown real eval scenario in provided suite subset: reject-and-replan-task-loop");
  });

  test("prints usage for the command entrypoint help path", async () => {
    const outputs: string[] = [];

    const exitCode = await executeRealEvalSuiteCommand(["--help"], {
      stdout: {
        write(chunk) {
          outputs.push(chunk);
        },
      },
      stderr: {
        write(chunk) {
          outputs.push(chunk);
        },
      },
    });

    expect(exitCode).toBe(0);
    expect(outputs.join("")).toContain("Usage: bun run eval:real");
  });

  test("records sample execution failures with stage, message, and planned artifact paths", async () => {
    const rootDir = await createTempDir("openpx-real-eval-fail-sample-");
    const dataDir = path.join(rootDir, "openpx.db");

    const summary = await runRealEvalSuite({
      suiteId: REAL_EVAL_SUITE_ID,
      scenarioId: "approval-gated-bugfix-loop",
      rootDir,
      dataDir,
      runSample: async () => {
        throw new Error("missing OPENAI_API_KEY");
      },
    });

    const scenario = summary.scenarioSummaries[0];
    expect(summary.status).toBe("failed");
    expect(summary.exitCode).toBe(1);
    expect(scenario?.failureStage).toBe("sample_execution");
    expect(scenario?.message).toBe("missing OPENAI_API_KEY");
    expect(scenario?.capabilityFamily).toBe("approval_gated_delete");
    expect(scenario?.failureClass).toBe("eval_harness_gap");
    expect(scenario?.evolutionTarget).toBe("eval_harness");
    expect(scenario?.artifactsDir).toBe(path.join(rootDir, "approval-gated-bugfix-loop", "artifacts"));
    expect(scenario?.tracePath).toBeUndefined();
    expect(summary.evolutionCandidates).toEqual([
      expect.objectContaining({
        scenarioId: "approval-gated-bugfix-loop",
        promptVariantId: "canonical",
        capabilityFamily: "approval_gated_delete",
        failureClass: "eval_harness_gap",
        evolutionTarget: "eval_harness",
      }),
    ]);
  });

  test("records evaluation failures with stage, message, and persisted trace path", async () => {
    const rootDir = await createTempDir("openpx-real-eval-fail-eval-");
    const dataDir = path.join(rootDir, "openpx.db");
    const artifactsDir = path.join(rootDir, "approval-gated-bugfix-loop", "artifacts");
    const tracePath = path.join(artifactsDir, "trace.json");

    await fs.mkdir(artifactsDir, { recursive: true });
    await Bun.write(tracePath, JSON.stringify(createApprovalTrace()));

    const summary = await runRealEvalSuite({
      suiteId: REAL_EVAL_SUITE_ID,
      scenarioId: "approval-gated-bugfix-loop",
      rootDir,
      dataDir,
      runSample: async () => ({
        scenarioId: "approval-gated-bugfix-loop",
        promptVariantId: "canonical",
        status: "completed",
        threadId: "thread_real_eval",
        runId: "run_real_eval",
        taskId: "task_real_eval",
        workspaceRoot: path.join(rootDir, "approval-gated-bugfix-loop", "workspace"),
        artifactsDir,
        tracePath,
        trace: createApprovalTrace(),
      }),
      evaluateTrace: () => {
        throw new Error("broken comparable payload");
      },
    });

    const scenario = summary.scenarioSummaries[0];
    expect(scenario?.failureStage).toBe("evaluation");
    expect(scenario?.message).toBe("broken comparable payload");
    expect(scenario?.failureClass).toBe("eval_harness_gap");
    expect(scenario?.evolutionTarget).toBe("eval_harness");
    expect(scenario?.artifactsDir).toBe(artifactsDir);
    expect(scenario?.tracePath).toBe(tracePath);
  });

  test("records review queue persistence failures with stage, message, and trace path", async () => {
    const rootDir = await createTempDir("openpx-real-eval-fail-review-");
    const dataDir = path.join(rootDir, "openpx.db");
    const artifactsDir = path.join(rootDir, "approval-gated-bugfix-loop", "artifacts");
    const tracePath = path.join(artifactsDir, "trace.json");

    await fs.mkdir(artifactsDir, { recursive: true });
    await Bun.write(tracePath, JSON.stringify(createApprovalTrace()));

    const summary = await runRealEvalSuite({
      suiteId: REAL_EVAL_SUITE_ID,
      scenarioId: "approval-gated-bugfix-loop",
      rootDir,
      dataDir,
      runSample: async () => ({
        scenarioId: "approval-gated-bugfix-loop",
        promptVariantId: "canonical",
        status: "completed",
        threadId: "thread_real_eval",
        runId: "run_real_eval",
        taskId: "task_real_eval",
        workspaceRoot: path.join(rootDir, "approval-gated-bugfix-loop", "workspace"),
        artifactsDir,
        tracePath,
        trace: createApprovalTrace(),
      }),
      persistReviewItems: async () => {
        throw new Error("sqlite is locked");
      },
    });

    const scenario = summary.scenarioSummaries[0];
    expect(scenario?.failureStage).toBe("review_queue_persist");
    expect(scenario?.message).toBe("sqlite is locked");
    expect(scenario?.failureClass).toBe("eval_harness_gap");
    expect(scenario?.evolutionTarget).toBe("eval_harness");
    expect(scenario?.artifactsDir).toBe(artifactsDir);
    expect(scenario?.tracePath).toBe(tracePath);
  });

  test("renders failure stage, message, and paths in the default CLI output", async () => {
    const outputs: string[] = [];

    const exitCode = await executeRealEvalSuiteCommand(
      ["--scenario", "approval-gated-bugfix-loop"],
      {
        stdout: {
          write(chunk) {
            outputs.push(chunk);
          },
        },
        stderr: {
          write(chunk) {
            outputs.push(chunk);
          },
        },
      },
      {
        async runSuite() {
          return {
            lane: "real-eval",
            suiteId: REAL_EVAL_SUITE_ID,
            suiteRunId: "real_eval_suite_run_test",
            status: "failed",
            exitCode: 1,
            scenarioSummaries: [
              {
                scenarioId: "approval-gated-bugfix-loop",
                scenarioVersion: 1,
                family: "approval-gated-bugfix-loop",
                capabilityFamily: "approval_gated_delete",
                status: "failed",
                promptVariantId: "constraint",
                failureStage: "sample_execution",
                message: "missing OPENAI_API_KEY",
                failureClass: "planner_normalization_failure",
                evolutionTarget: "planner",
                artifactsDir: "/tmp/openpx-real-eval/approval-gated-bugfix-loop/artifacts",
                tracePath: "/tmp/openpx-real-eval/approval-gated-bugfix-loop/artifacts/trace.json",
              },
            ],
            evolutionCandidates: [
              {
                scenarioId: "approval-gated-bugfix-loop",
                promptVariantId: "constraint",
                capabilityFamily: "approval_gated_delete",
                failureClass: "planner_normalization_failure",
                evolutionTarget: "planner",
                rootCauseHypothesis: "Planner did not normalize the prompt variant into the delete capability.",
                promoteToRegression: "deterministic_eval",
                blockingMilestone: "M1",
              },
            ],
            promotionSummaries: [
              {
                capabilityFamily: "approval_gated_delete",
                promotionStatus: "not_ready",
                promotionEvidence: {
                  liveRealEvalPassed: false,
                  deterministicRegressionPresent: true,
                  runtimeRegressionPresent: true,
                },
                mappedGuardrails: [
                  {
                    guardrailId: "approval.planner.quoted_path_patch_placeholder",
                    capabilityFamily: "approval_gated_delete",
                    failureClass: "planner_normalization_failure",
                    rootCauseLayer: "planner",
                    regressionType: "deterministic_eval",
                    description: "Quoted delete paths and patch:file placeholders must normalize into apply_patch.delete_file.",
                  },
                ],
              },
            ],
          };
        },
      },
    );

    const rendered = outputs.join("");
    expect(exitCode).toBe(1);
    expect(rendered).toContain("approval-gated-bugfix-loop [failed]");
    expect(rendered).toContain("variant: constraint");
    expect(rendered).toContain("stage: sample_execution");
    expect(rendered).toContain("reason: missing OPENAI_API_KEY");
    expect(rendered).toContain("failure class: planner_normalization_failure");
    expect(rendered).toContain("evolution target: planner");
    expect(rendered).toContain("artifacts: /tmp/openpx-real-eval/approval-gated-bugfix-loop/artifacts");
    expect(rendered).toContain("trace: /tmp/openpx-real-eval/approval-gated-bugfix-loop/artifacts/trace.json");
    expect(rendered).toContain("Promotions: 1");
    expect(rendered).toContain("approval_gated_delete [not_ready]");
    expect(rendered).toContain("evidence: live=false deterministic=true runtime=true");
  });

  test("includes failure metadata in --json output", async () => {
    const outputs: string[] = [];

    const exitCode = await executeRealEvalSuiteCommand(
      ["--scenario", "approval-gated-bugfix-loop", "--json"],
      {
        stdout: {
          write(chunk) {
            outputs.push(chunk);
          },
        },
        stderr: {
          write(chunk) {
            outputs.push(chunk);
          },
        },
      },
      {
        async runSuite() {
          return {
            lane: "real-eval",
            suiteId: REAL_EVAL_SUITE_ID,
            suiteRunId: "real_eval_suite_run_test",
            status: "failed",
            exitCode: 1,
            scenarioSummaries: [
              {
                scenarioId: "approval-gated-bugfix-loop",
                scenarioVersion: 1,
                family: "approval-gated-bugfix-loop",
                capabilityFamily: "approval_gated_delete",
                status: "failed",
                promptVariantId: "polite",
                failureStage: "evaluation",
                message: "broken comparable payload",
                failureClass: "eval_harness_gap",
                evolutionTarget: "eval_harness",
                artifactsDir: "/tmp/openpx-real-eval/approval-gated-bugfix-loop/artifacts",
                tracePath: "/tmp/openpx-real-eval/approval-gated-bugfix-loop/artifacts/trace.json",
              },
            ],
            evolutionCandidates: [
              {
                scenarioId: "approval-gated-bugfix-loop",
                promptVariantId: "polite",
                capabilityFamily: "approval_gated_delete",
                failureClass: "eval_harness_gap",
                evolutionTarget: "eval_harness",
                rootCauseHypothesis: "Evaluation failed before a stable real-eval diagnosis could be produced.",
                promoteToRegression: "scenario_fixture",
                blockingMilestone: "M1",
              },
            ],
            promotionSummaries: [
              {
                capabilityFamily: "approval_gated_delete",
                promotionStatus: "ready_for_foundation_guard",
                promotionEvidence: {
                  liveRealEvalPassed: true,
                  deterministicRegressionPresent: true,
                  runtimeRegressionPresent: true,
                },
                mappedGuardrails: [
                  {
                    guardrailId: "approval.runtime.run_loop_resume_after_approval",
                    capabilityFamily: "approval_gated_delete",
                    failureClass: "approval_control_failure",
                    rootCauseLayer: "approval_runtime",
                    regressionType: "runtime_test",
                    description: "Approved delete requests must return through the run-loop and execute the stored apply_patch delete action.",
                  },
                ],
              },
            ],
          };
        },
      },
    );

    const payload = JSON.parse(outputs.join(""));
    expect(exitCode).toBe(1);
    expect(payload.scenarioSummaries[0].promptVariantId).toBe("polite");
    expect(payload.scenarioSummaries[0].capabilityFamily).toBe("approval_gated_delete");
    expect(payload.scenarioSummaries[0].failureStage).toBe("evaluation");
    expect(payload.scenarioSummaries[0].message).toBe("broken comparable payload");
    expect(payload.scenarioSummaries[0].failureClass).toBe("eval_harness_gap");
    expect(payload.scenarioSummaries[0].evolutionTarget).toBe("eval_harness");
    expect(payload.scenarioSummaries[0].artifactsDir).toBe("/tmp/openpx-real-eval/approval-gated-bugfix-loop/artifacts");
    expect(payload.scenarioSummaries[0].tracePath).toBe("/tmp/openpx-real-eval/approval-gated-bugfix-loop/artifacts/trace.json");
    expect(payload.evolutionCandidates[0].failureClass).toBe("eval_harness_gap");
    expect(payload.evolutionCandidates[0].evolutionTarget).toBe("eval_harness");
    expect(payload.promotionSummaries[0].capabilityFamily).toBe("approval_gated_delete");
    expect(payload.promotionSummaries[0].promotionStatus).toBe("ready_for_foundation_guard");
    expect(payload.promotionSummaries[0].promotionEvidence.liveRealEvalPassed).toBe(true);
  });
});
