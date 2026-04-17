import fs from "node:fs/promises";
import path from "node:path";
import { createAppContext } from "../app/bootstrap";
import { createApprovalRequest } from "../domain/approval";
import { createRun, transitionRun } from "../domain/run";
import { createThread } from "../domain/thread";
import { createApprovalSuspension } from "../harness/core/run-loop/approval-suspension";
import type { ModelGateway } from "../infra/model-gateway";
import type { EvalScenario } from "./eval-schema";
import { createSqlite } from "../persistence/sqlite/sqlite-client";
import { migrateSqlite } from "../persistence/sqlite/sqlite-migrator";

/** 核心 deterministic eval suite 标识 */
export const CORE_EVAL_SUITE_ID = "core-eval-suite";

/** 返回空的状态/事件监听器 */
function createNoopHandlers() {
  return () => {};
}

/** happy-path 专用测试 gateway */
function createHappyPathGateway(): ModelGateway {
  return {
    async plan() {
      return { summary: "plan" };
    },
    async verify() {
      return { summary: "verified", isValid: true };
    },
    async respond() {
      return { summary: "plan" };
    },
    onStatusChange() {
      return createNoopHandlers();
    },
    onEvent() {
      return createNoopHandlers();
    },
  };
}

/** approval 场景专用 gateway */
function createApprovalGateway(): ModelGateway {
  return {
    async plan() {
      return {
        summary: "plan delete",
        plannerResult: {
          workPackages: [
            {
              id: "pkg_delete",
              objective: "delete approved.txt",
              allowedTools: ["apply_patch"],
              inputRefs: ["thread:goal", "file:approved.txt"],
              expectedArtifacts: ["patch:approved.txt"],
            },
          ],
          acceptanceCriteria: ["approved.txt is removed"],
          riskFlags: [],
          approvalRequiredActions: ["apply_patch.delete_file"],
          verificationScope: ["workspace file state"],
        },
      };
    },
    async verify() {
      return { summary: "verified", isValid: true };
    },
    async respond() {
      return { summary: "Deleted approved.txt" };
    },
    onStatusChange() {
      return createNoopHandlers();
    },
    onEvent() {
      return createNoopHandlers();
    },
  };
}

/** reject/replan 场景专用 gateway */
function createRejectionGateway(): ModelGateway {
  return {
    async plan(input: { prompt: string }) {
      return { summary: input.prompt };
    },
    async verify() {
      return { summary: "verified", isValid: true };
    },
    async respond() {
      return { summary: "continue safely without deleting files" };
    },
    onStatusChange() {
      return createNoopHandlers();
    },
    onEvent() {
      return createNoopHandlers();
    },
  };
}

/** 多 work package 场景专用 gateway */
function createMultiPackageGateway(): ModelGateway {
  return {
    async plan() {
      return {
        summary: "plan two work packages",
        plannerResult: {
          workPackages: [
            {
              id: "pkg_one",
              objective: "summarize package one",
              allowedTools: ["read_file"],
              inputRefs: ["thread:goal"],
              expectedArtifacts: ["summary:pkg_one"],
            },
            {
              id: "pkg_two",
              objective: "summarize package two",
              allowedTools: ["read_file"],
              inputRefs: ["thread:goal"],
              expectedArtifacts: ["summary:pkg_two"],
            },
          ],
          acceptanceCriteria: ["both work packages are completed"],
          riskFlags: [],
          approvalRequiredActions: [],
          verificationScope: ["planner state"],
        },
      };
    },
    async verify() {
      return { summary: "verified", isValid: true };
    },
    async respond() {
      return { summary: "Completed multi-package cleanup" };
    },
    onStatusChange() {
      return createNoopHandlers();
    },
    onEvent() {
      return createNoopHandlers();
    },
  };
}

export const coreEvalScenarios: EvalScenario[] = [
  {
    id: "capability-happy-path",
    version: 1,
    family: "happy-path",
    summary: "basic capability request completes without approvals",
    setup: "empty workspace with deterministic model gateway",
    steps: ["create thread", "start root task", "collect runtime state"],
    expectedControlSemantics: {
      requiresApproval: false,
      expectedDecision: "none",
      expectedGraphResume: false,
      expectedRecoveryMode: "none",
    },
    expectedOutcome: {
      terminalRunStatus: "completed",
      terminalTaskStatus: "completed",
      expectedSummaryIncludes: ["plan"],
      expectedApprovalCount: 0,
      expectedPendingApprovalCount: 0,
      expectedToolCallCount: 0,
    },
    createModelGateway() {
      return createHappyPathGateway();
    },
    async run({ ctx, workspaceRoot }) {
      const thread = createThread("thread_happy_path", workspaceRoot, ctx.config.projectId);
      await ctx.stores.threadStore.save(thread);
      const result = await ctx.controlPlane.startRootTask(thread.threadId, "what is my name?");
      return {
        threadId: thread.threadId,
        finalResult: result,
      };
    },
  },
  {
    id: "multi-package-happy-path",
    version: 1,
    family: "happy-path",
    summary: "multi work package task completes through the full run-loop",
    setup: "planner emits two non-approval work packages",
    steps: ["create thread", "start root task", "complete both work packages", "collect runtime state"],
    expectedControlSemantics: {
      requiresApproval: false,
      expectedDecision: "none",
      expectedGraphResume: false,
      expectedRecoveryMode: "none",
    },
    expectedOutcome: {
      terminalRunStatus: "completed",
      terminalTaskStatus: "completed",
      expectedSummaryIncludes: ["Completed multi-package cleanup"],
      expectedApprovalCount: 0,
      expectedPendingApprovalCount: 0,
      expectedToolCallCount: 0,
    },
    createModelGateway() {
      return createMultiPackageGateway();
    },
    async run({ ctx, workspaceRoot }) {
      const thread = createThread("thread_multi_package_path", workspaceRoot, ctx.config.projectId);
      await ctx.stores.threadStore.save(thread);
      const result = await ctx.controlPlane.startRootTask(thread.threadId, "complete multi package cleanup");
      return {
        threadId: thread.threadId,
        finalResult: result,
      };
    },
  },
  {
    id: "approval-required-then-approved",
    version: 1,
    family: "approval-required",
    summary: "approval-required task resumes through the run-loop after approval",
    setup: "workspace contains approved.txt and planner emits a delete work package",
    steps: ["create thread", "start root task", "pause on approval", "approve request"],
    expectedControlSemantics: {
      requiresApproval: true,
      expectedDecision: "approved",
      expectedGraphResume: true,
      expectedRecoveryMode: "none",
    },
    expectedOutcome: {
      terminalRunStatus: "completed",
      terminalTaskStatus: "completed",
      expectedSummaryIncludes: ["Deleted approved.txt"],
      expectedApprovalCount: 1,
      expectedPendingApprovalCount: 0,
      expectedToolCallCount: 1,
    },
    createModelGateway() {
      return createApprovalGateway();
    },
    async run({ ctx, workspaceRoot }) {
      const filePath = path.join(workspaceRoot, "approved.txt");
      await fs.mkdir(workspaceRoot, { recursive: true });
      await fs.writeFile(filePath, "approved\n");

      const thread = createThread("thread_approval_path", workspaceRoot, ctx.config.projectId);
      await ctx.stores.threadStore.save(thread);

      const blocked = await ctx.controlPlane.startRootTask(thread.threadId, "clean up approved artifact");
      const approvalRequestId = blocked.approvals[0]?.approvalRequestId;
      if (!approvalRequestId) {
        throw new Error("approval request was not created for approval-required scenario");
      }

      const completed = await ctx.controlPlane.approveRequest(approvalRequestId);
      return {
        threadId: thread.threadId,
        initialResult: blocked,
        finalResult: completed,
      };
    },
  },
  {
    id: "rejection-then-run-loop-replan",
    version: 1,
    family: "reject-and-replan",
    summary: "rejected approval routes back through planning with a deterministic reason",
    setup: "run-loop state is waiting on a delete approval",
    steps: ["seed run-loop suspension", "seed waiting approval", "reject request", "collect replanned run"],
    expectedControlSemantics: {
      requiresApproval: true,
      expectedDecision: "rejected",
      expectedGraphResume: true,
      expectedRecoveryMode: "none",
    },
    expectedOutcome: {
      terminalRunStatus: "completed",
      terminalTaskStatus: "completed",
      expectedSummaryIncludes: ["continue safely without deleting files"],
      expectedApprovalCount: 1,
      expectedPendingApprovalCount: 0,
      expectedToolCallCount: 0,
    },
    createModelGateway() {
      return createRejectionGateway();
    },
    async run({ ctx, workspaceRoot, dataDir }) {
      const filePath = path.join(workspaceRoot, "src", "legacy-delete.ts");
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "export const legacyDelete = true;\n");

      const deletePackage = {
        id: "pkg_delete",
        objective: "delete src/legacy-delete.ts",
        allowedTools: ["apply_patch"],
        inputRefs: ["thread:goal", "file:src/legacy-delete.ts"],
        expectedArtifacts: ["patch:src/legacy-delete.ts"],
      };

      const thread = createThread("thread_reject_path", workspaceRoot, ctx.config.projectId);
      await ctx.stores.threadStore.save(thread);

      const run = transitionRun(
        transitionRun(
          createRun({
            runId: "run_reject_path",
            threadId: thread.threadId,
            trigger: "approval_resume",
            inputText: "reject patch",
          }),
          "running",
        ),
        "waiting_approval",
      );

      await ctx.stores.runStore.save({
        ...run,
        activeTaskId: "task_reject_path",
        blockingReason: {
          kind: "waiting_approval",
          message: "apply_patch delete_file src/legacy-delete.ts",
        },
      });
      await ctx.stores.taskStore.save({
        taskId: "task_reject_path",
        threadId: thread.threadId,
        runId: run.runId,
        summary: "Delete legacy file",
        status: "blocked",
        blockingReason: {
          kind: "waiting_approval",
          message: "apply_patch delete_file src/legacy-delete.ts",
        },
      });
      await ctx.stores.approvalStore.save(
        createApprovalRequest({
          approvalRequestId: "approval_reject_path",
          threadId: thread.threadId,
          runId: run.runId,
          taskId: "task_reject_path",
          toolCallId: "task_reject_path:apply_patch",
          toolRequest: {
            toolCallId: "task_reject_path:apply_patch",
            threadId: thread.threadId,
            runId: run.runId,
            taskId: "task_reject_path",
            toolName: "apply_patch",
            args: {},
            action: "delete_file",
            path: filePath,
            changedFiles: 1,
          },
          summary: "apply_patch delete_file src/legacy-delete.ts",
          risk: "apply_patch.delete_file",
        }),
      );
      await ctx.stores.runStateStore.saveState({
        stateVersion: 1,
        engineVersion: "run-loop-v1",
        threadId: thread.threadId,
        runId: run.runId,
        taskId: "task_reject_path",
        input: "reject patch",
        nextStep: "waiting_approval",
        currentWorkPackageId: "pkg_delete",
        workPackages: [deletePackage],
        artifacts: [],
        latestArtifacts: [],
        pendingApproval: {
          summary: "Approval required before deleting src/legacy-delete.ts",
          approvalRequestId: "approval_reject_path",
        },
      });
      await ctx.stores.runStateStore.saveSuspension(
        createApprovalSuspension({
          threadId: thread.threadId,
          runId: run.runId,
          taskId: "task_reject_path",
          step: "execute",
          summary: "Approval required before deleting src/legacy-delete.ts",
          approvalRequestId: "approval_reject_path",
        }),
      );

      const completed = await ctx.controlPlane.rejectRequest("approval_reject_path");
      return {
        threadId: thread.threadId,
        finalResult: completed,
      };
    },
  },
  {
    id: "interruption-uncertain-recovery",
    version: 1,
    family: "recovery-path",
    summary: "uncertain execution on restart becomes a human-recovery object",
    setup: "running task has an execution ledger entry left in started state",
    steps: ["seed interrupted and resumed runs", "seed started ledger entry", "re-open app context", "collect blocked recovery state"],
    expectedControlSemantics: {
      requiresApproval: false,
      expectedDecision: "none",
      expectedGraphResume: false,
      expectedRecoveryMode: "human_recovery",
    },
    expectedOutcome: {
      terminalTaskStatus: "blocked",
      expectedSummaryIncludes: [],
      expectedApprovalCount: 0,
      expectedPendingApprovalCount: 0,
      expectedToolCallCount: 0,
    },
    createModelGateway() {
      return createHappyPathGateway();
    },
    async run({ ctx, workspaceRoot, dataDir }) {
      const thread = createThread("thread_recovery_path", workspaceRoot, ctx.config.projectId);
      await ctx.stores.threadStore.save(thread);

      const interruptedRun = transitionRun(
        transitionRun(
          createRun({
            runId: "run_recovery_interrupted",
            threadId: thread.threadId,
            trigger: "interrupt_resume",
            inputText: "recover interrupted run",
          }),
          "running",
        ),
        "interrupted",
      );
      const resumedRun = transitionRun(
        createRun({
          runId: "run_recovery_resumed",
          threadId: thread.threadId,
          trigger: "system_resume",
          inputText: "resume after restart",
        }),
        "running",
      );

      await ctx.stores.runStore.save(interruptedRun);
      await ctx.stores.runStore.save({
        ...resumedRun,
        activeTaskId: "task_recovery_path",
      });
      await ctx.stores.taskStore.save({
        taskId: "task_recovery_path",
        threadId: thread.threadId,
        runId: resumedRun.runId,
        summary: "Recover after crash",
        status: "running",
      });
      await ctx.stores.executionLedger.save({
        executionId: "execution_recovery_started",
        threadId: thread.threadId,
        runId: resumedRun.runId,
        taskId: "task_recovery_path",
        toolCallId: "task_recovery_path:apply_patch",
        toolName: "apply_patch",
        argsJson: "{}",
        status: "started",
        createdAt: "2026-04-09T00:00:00.000Z",
        updatedAt: "2026-04-09T00:00:00.000Z",
      });

      const recoveredContext = await createAppContext({
        workspaceRoot,
        dataDir,
        modelGateway: createHappyPathGateway(),
      });

      return {
        threadId: thread.threadId,
        postRunContext: recoveredContext,
      };
    },
  },
  {
    id: "approval-approved-restart-idempotent",
    version: 1,
    family: "approval-required",
    summary: "approved execution stays idempotent after restart and does not duplicate side effects",
    setup: "approval-required delete completes once and app context is reopened against the same data dir",
    steps: ["create thread", "pause on approval", "approve request", "restart app context", "collect persisted state"],
    expectedControlSemantics: {
      requiresApproval: true,
      expectedDecision: "approved",
      expectedGraphResume: true,
      expectedRecoveryMode: "none",
    },
    expectedOutcome: {
      terminalRunStatus: "completed",
      terminalTaskStatus: "completed",
      expectedSummaryIncludes: ["Deleted approved.txt"],
      expectedApprovalCount: 1,
      expectedPendingApprovalCount: 0,
      expectedToolCallCount: 1,
    },
    createModelGateway() {
      return createApprovalGateway();
    },
    async run({ ctx, workspaceRoot, dataDir }) {
      const filePath = path.join(workspaceRoot, "approved.txt");
      await fs.mkdir(workspaceRoot, { recursive: true });
      await fs.writeFile(filePath, "approved\n");

      const thread = createThread("thread_approval_restart_path", workspaceRoot, ctx.config.projectId);
      await ctx.stores.threadStore.save(thread);

      const blocked = await ctx.controlPlane.startRootTask(thread.threadId, "clean up approved artifact after restart");
      const approvalRequestId = blocked.approvals[0]?.approvalRequestId;
      if (!approvalRequestId) {
        throw new Error("approval request was not created for approval restart scenario");
      }

      const completed = await ctx.controlPlane.approveRequest(approvalRequestId);
      const recoveredContext = await createAppContext({
        workspaceRoot,
        dataDir,
        modelGateway: createApprovalGateway(),
      });

      return {
        threadId: thread.threadId,
        initialResult: blocked,
        finalResult: completed,
        postRunContext: recoveredContext,
      };
    },
  },
  {
    id: "duplicate-approve-safe",
    version: 1,
    family: "approval-required",
    summary: "duplicate approve converges to one completed run without duplicate side effects",
    setup: "approval-required delete is approved twice sequentially",
    steps: ["create thread", "pause on approval", "approve request twice", "collect runtime state"],
    expectedControlSemantics: {
      requiresApproval: true,
      expectedDecision: "approved",
      expectedGraphResume: true,
      expectedRecoveryMode: "none",
    },
    expectedOutcome: {
      terminalRunStatus: "completed",
      terminalTaskStatus: "completed",
      expectedSummaryIncludes: ["Deleted approved.txt"],
      expectedApprovalCount: 1,
      expectedPendingApprovalCount: 0,
      expectedToolCallCount: 1,
    },
    createModelGateway() {
      return createApprovalGateway();
    },
    async run({ ctx, workspaceRoot }) {
      const filePath = path.join(workspaceRoot, "approved.txt");
      await fs.mkdir(workspaceRoot, { recursive: true });
      await fs.writeFile(filePath, "approved\n");

      const thread = createThread("thread_duplicate_approve_path", workspaceRoot, ctx.config.projectId);
      await ctx.stores.threadStore.save(thread);

      const blocked = await ctx.controlPlane.startRootTask(thread.threadId, "clean up approved artifact");
      const approvalRequestId = blocked.approvals[0]?.approvalRequestId;
      if (!approvalRequestId) {
        throw new Error("approval request was not created for duplicate approve scenario");
      }

      const first = await ctx.controlPlane.approveRequest(approvalRequestId);
      const second = await ctx.controlPlane.approveRequest(approvalRequestId);
      const ledgerEntries = await ctx.stores.executionLedger.listByThread(thread.threadId);
      if (second.resumeDisposition !== "already_resolved") {
        throw new Error("duplicate approve did not converge to already_resolved");
      }
      if (ledgerEntries.filter((entry) => entry.status === "completed").length !== 1) {
        throw new Error("duplicate approve executed side effects more than once");
      }

      return {
        threadId: thread.threadId,
        initialResult: blocked,
        finalResult: first,
      };
    },
  },
  {
    id: "concurrent-approve-safe",
    version: 1,
    family: "approval-required",
    summary: "concurrent approve requests converge without duplicating side effects",
    setup: "approval-required delete is approved simultaneously from two surfaces",
    steps: ["create thread", "pause on approval", "approve request concurrently", "collect runtime state"],
    expectedControlSemantics: {
      requiresApproval: true,
      expectedDecision: "approved",
      expectedGraphResume: true,
      expectedRecoveryMode: "none",
    },
    expectedOutcome: {
      terminalRunStatus: "completed",
      terminalTaskStatus: "completed",
      expectedSummaryIncludes: ["Deleted approved.txt"],
      expectedApprovalCount: 1,
      expectedPendingApprovalCount: 0,
      expectedToolCallCount: 1,
    },
    createModelGateway() {
      return createApprovalGateway();
    },
    async run({ ctx, workspaceRoot }) {
      const filePath = path.join(workspaceRoot, "approved.txt");
      await fs.mkdir(workspaceRoot, { recursive: true });
      await fs.writeFile(filePath, "approved\n");

      const thread = createThread("thread_concurrent_approve_path", workspaceRoot, ctx.config.projectId);
      await ctx.stores.threadStore.save(thread);

      const blocked = await ctx.controlPlane.startRootTask(thread.threadId, "clean up approved artifact");
      const approvalRequestId = blocked.approvals[0]?.approvalRequestId;
      if (!approvalRequestId) {
        throw new Error("approval request was not created for concurrent approve scenario");
      }

      const results = await Promise.all([
        ctx.controlPlane.approveRequest(approvalRequestId),
        ctx.controlPlane.approveRequest(approvalRequestId),
      ]);
      const ledgerEntries = await ctx.stores.executionLedger.listByThread(thread.threadId);
      if (ledgerEntries.filter((entry) => entry.status === "completed").length !== 1) {
        throw new Error("concurrent approve executed side effects more than once");
      }
      if (!results.some((result) => result.resumeDisposition === "already_resolved" || result.status === "completed")) {
        throw new Error("concurrent approve did not return stable converge semantics");
      }

      return {
        threadId: thread.threadId,
        initialResult: blocked,
        finalResult: results[0],
      };
    },
  },
  {
    id: "rejection-no-executor-shortcut",
    version: 1,
    family: "reject-and-replan",
    summary: "rejected approvals reroute through planning without executor side effects",
    setup: "run-loop rejection flow includes a planned ledger entry but must not produce executed side effects",
    steps: ["seed run-loop suspension", "seed waiting approval", "seed planned ledger", "reject request", "collect replanned run"],
    expectedControlSemantics: {
      requiresApproval: true,
      expectedDecision: "rejected",
      expectedGraphResume: true,
      expectedRecoveryMode: "none",
    },
    expectedOutcome: {
      terminalRunStatus: "completed",
      terminalTaskStatus: "completed",
      expectedSummaryIncludes: ["continue safely without deleting files"],
      expectedApprovalCount: 1,
      expectedPendingApprovalCount: 0,
      expectedToolCallCount: 0,
    },
    createModelGateway() {
      return createRejectionGateway();
    },
    async run({ ctx, workspaceRoot, dataDir }) {
      const filePath = path.join(workspaceRoot, "src", "shortcut-risk.ts");
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "export const shortcutRisk = true;\n");

      const deletePackage = {
        id: "pkg_delete",
        objective: "delete src/shortcut-risk.ts",
        allowedTools: ["apply_patch"],
        inputRefs: ["thread:goal", "file:src/shortcut-risk.ts"],
        expectedArtifacts: ["patch:src/shortcut-risk.ts"],
      };

      const thread = createThread("thread_reject_shortcut_path", workspaceRoot, ctx.config.projectId);
      await ctx.stores.threadStore.save(thread);

      const run = transitionRun(
        transitionRun(
          createRun({
            runId: "run_reject_shortcut",
            threadId: thread.threadId,
            trigger: "approval_resume",
            inputText: "reject patch",
          }),
          "running",
        ),
        "waiting_approval",
      );

      await ctx.stores.runStore.save({
        ...run,
        activeTaskId: "task_reject_shortcut",
        blockingReason: {
          kind: "waiting_approval",
          message: "apply_patch delete_file src/shortcut-risk.ts",
        },
      });
      await ctx.stores.taskStore.save({
        taskId: "task_reject_shortcut",
        threadId: thread.threadId,
        runId: run.runId,
        summary: "Delete risky shortcut file",
        status: "blocked",
        blockingReason: {
          kind: "waiting_approval",
          message: "apply_patch delete_file src/shortcut-risk.ts",
        },
      });
      await ctx.stores.approvalStore.save(
        createApprovalRequest({
          approvalRequestId: "approval_reject_shortcut",
          threadId: thread.threadId,
          runId: run.runId,
          taskId: "task_reject_shortcut",
          toolCallId: "task_reject_shortcut:apply_patch",
          toolRequest: {
            toolCallId: "task_reject_shortcut:apply_patch",
            threadId: thread.threadId,
            runId: run.runId,
            taskId: "task_reject_shortcut",
            toolName: "apply_patch",
            args: {},
            action: "delete_file",
            path: filePath,
            changedFiles: 1,
          },
          summary: "apply_patch delete_file src/shortcut-risk.ts",
          risk: "apply_patch.delete_file",
        }),
      );
      await ctx.stores.runStateStore.saveState({
        stateVersion: 1,
        engineVersion: "run-loop-v1",
        threadId: thread.threadId,
        runId: run.runId,
        taskId: "task_reject_shortcut",
        input: "reject patch",
        nextStep: "waiting_approval",
        currentWorkPackageId: "pkg_delete",
        workPackages: [deletePackage],
        artifacts: [],
        latestArtifacts: [],
        pendingApproval: {
          summary: "Approval required before deleting src/shortcut-risk.ts",
          approvalRequestId: "approval_reject_shortcut",
        },
      });
      await ctx.stores.runStateStore.saveSuspension(
        createApprovalSuspension({
          threadId: thread.threadId,
          runId: run.runId,
          taskId: "task_reject_shortcut",
          step: "execute",
          summary: "Approval required before deleting src/shortcut-risk.ts",
          approvalRequestId: "approval_reject_shortcut",
        }),
      );
      await ctx.stores.executionLedger.save({
        executionId: "execution_reject_shortcut_planned",
        threadId: thread.threadId,
        runId: run.runId,
        taskId: "task_reject_shortcut",
        toolCallId: "task_reject_shortcut:apply_patch",
        toolName: "apply_patch",
        argsJson: "{}",
        status: "planned",
        createdAt: "2026-04-09T00:00:00.000Z",
        updatedAt: "2026-04-09T00:00:00.000Z",
      });

      const completed = await ctx.controlPlane.rejectRequest("approval_reject_shortcut");
      return {
        threadId: thread.threadId,
        finalResult: completed,
      };
    },
  },
  {
    id: "double-blocked-recovery",
    version: 1,
    family: "recovery-path",
    summary: "repeated resume attempts remain explicitly blocked for human recovery",
    setup: "two resumed runs both land back in human recovery with a blocked latest task",
    steps: ["seed interrupted run", "seed two resumed blocked runs", "persist human recovery facts", "collect blocked state"],
    expectedControlSemantics: {
      requiresApproval: false,
      expectedDecision: "none",
      expectedGraphResume: false,
      expectedRecoveryMode: "human_recovery",
    },
    expectedOutcome: {
      terminalRunStatus: "blocked",
      terminalTaskStatus: "blocked",
      expectedSummaryIncludes: ["Human recovery required after repeated resume attempts"],
      expectedApprovalCount: 0,
      expectedPendingApprovalCount: 0,
      expectedToolCallCount: 0,
    },
    createModelGateway() {
      return createHappyPathGateway();
    },
    async run({ ctx, workspaceRoot }) {
      const thread = createThread("thread_double_block_path", workspaceRoot, ctx.config.projectId);
      await ctx.stores.threadStore.save({
        ...thread,
        recoveryFacts: {
          threadId: thread.threadId,
          revision: 2,
          schemaVersion: 1,
          status: "blocked",
          updatedAt: "2026-04-09T00:00:00.000Z",
          activeTask: {
            taskId: "task_double_block_2",
            status: "blocked",
            summary: "Retry blocked recovery path",
          },
          blocking: {
            sourceTaskId: "task_double_block_2",
            kind: "human_recovery",
            message: "Human recovery required after repeated resume attempts",
          },
          pendingApprovals: [],
        },
      });

      const interruptedRun = transitionRun(
        transitionRun(
          createRun({
            runId: "run_double_block_interrupted",
            threadId: thread.threadId,
            trigger: "interrupt_resume",
            inputText: "recover interrupted run",
          }),
          "running",
        ),
        "interrupted",
      );
      const resumedBlockedOne = transitionRun(
        transitionRun(
          createRun({
            runId: "run_double_block_resume_1",
            threadId: thread.threadId,
            trigger: "system_resume",
            inputText: "system resume one",
          }),
          "running",
        ),
        "blocked",
      );
      const resumedBlockedTwo = transitionRun(
        transitionRun(
          createRun({
            runId: "run_double_block_resume_2",
            threadId: thread.threadId,
            trigger: "interrupt_resume",
            inputText: "system resume two",
          }),
          "running",
        ),
        "blocked",
      );

      await ctx.stores.runStore.save(interruptedRun);
      await ctx.stores.runStore.save({
        ...resumedBlockedOne,
        activeTaskId: "task_double_block_1",
        resultSummary: "Human recovery required after repeated resume attempts",
        blockingReason: {
          kind: "human_recovery",
          message: "Human recovery required after repeated resume attempts",
        },
      });
      await ctx.stores.runStore.save({
        ...resumedBlockedTwo,
        activeTaskId: "task_double_block_2",
        resultSummary: "Human recovery required after repeated resume attempts",
        blockingReason: {
          kind: "human_recovery",
          message: "Human recovery required after repeated resume attempts",
        },
      });
      await ctx.stores.taskStore.save({
        taskId: "task_double_block_1",
        threadId: thread.threadId,
        runId: resumedBlockedOne.runId,
        summary: "First blocked recovery path",
        status: "blocked",
        blockingReason: {
          kind: "human_recovery",
          message: "Human recovery required after repeated resume attempts",
        },
      });
      await ctx.stores.taskStore.save({
        taskId: "task_double_block_2",
        threadId: thread.threadId,
        runId: resumedBlockedTwo.runId,
        summary: "Retry blocked recovery path",
        status: "blocked",
        blockingReason: {
          kind: "human_recovery",
          message: "Human recovery required after repeated resume attempts",
        },
      });

      return {
        threadId: thread.threadId,
      };
    },
  },
  {
    id: "cancel-waiting-approval-path",
    version: 1,
    family: "recovery-path",
    summary: "cancel while waiting approval interrupts the run and invalidates old approval recovery",
    setup: "approval-required delete is cancelled before approval is resolved",
    steps: ["create thread", "pause on approval", "cancel run", "attempt stale approve", "collect runtime state"],
    expectedControlSemantics: {
      requiresApproval: true,
      expectedDecision: "none",
      expectedGraphResume: false,
      expectedRecoveryMode: "none",
    },
    expectedOutcome: {
      terminalRunStatus: "interrupted",
      terminalTaskStatus: "cancelled",
      expectedSummaryIncludes: ["Interrupted from TUI"],
      expectedApprovalCount: 1,
      expectedPendingApprovalCount: 0,
      expectedToolCallCount: 0,
    },
    createModelGateway() {
      return createApprovalGateway();
    },
    async run({ ctx, workspaceRoot }) {
      const filePath = path.join(workspaceRoot, "approved.txt");
      await fs.mkdir(workspaceRoot, { recursive: true });
      await fs.writeFile(filePath, "approved\n");

      const thread = createThread("thread_cancel_approval_path", workspaceRoot, ctx.config.projectId);
      await ctx.stores.threadStore.save(thread);

      const blocked = await ctx.controlPlane.startRootTask(thread.threadId, "clean up approved artifact");
      const approvalRequestId = blocked.approvals[0]?.approvalRequestId;
      if (!approvalRequestId) {
        throw new Error("approval request was not created for cancel waiting approval scenario");
      }

      const cancelled = await ctx.controlPlane.cancelThread(thread.threadId);
      const afterApprove = await ctx.controlPlane.approveRequest(approvalRequestId);
      if (!cancelled) {
        throw new Error("cancelThread returned false for waiting approval scenario");
      }
      if (afterApprove.resumeDisposition !== "invalidated") {
        throw new Error("cancelled approval was still resumable");
      }

      return {
        threadId: thread.threadId,
        initialResult: blocked,
        finalResult: afterApprove,
      };
    },
  },
  {
    id: "version-mismatch-human-recovery",
    version: 1,
    family: "recovery-path",
    summary: "state version mismatch downgrades approval resume into human recovery",
    setup: "run-loop state carries an incompatible engine/state version at approval resume time",
    steps: ["seed waiting approval run", "seed mismatched run-loop state", "approve request", "collect blocked recovery state"],
    expectedControlSemantics: {
      requiresApproval: true,
      expectedDecision: "approved",
      expectedGraphResume: false,
      expectedRecoveryMode: "human_recovery",
    },
    expectedOutcome: {
      terminalRunStatus: "blocked",
      terminalTaskStatus: "blocked",
      expectedSummaryIncludes: [],
      expectedApprovalCount: 1,
      expectedPendingApprovalCount: 0,
      expectedToolCallCount: 0,
    },
    createModelGateway() {
      return createApprovalGateway();
    },
    async run({ ctx, workspaceRoot }) {
      const filePath = path.join(workspaceRoot, "src", "version-mismatch.ts");
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "export const versionMismatch = true;\n");

      const thread = createThread("thread_version_mismatch_path", workspaceRoot, ctx.config.projectId);
      await ctx.stores.threadStore.save(thread);

      const run = transitionRun(
        transitionRun(
          createRun({
            runId: "run_version_mismatch",
            threadId: thread.threadId,
            trigger: "approval_resume",
            inputText: "resume mismatched run-loop state",
          }),
          "running",
        ),
        "waiting_approval",
      );

      await ctx.stores.runStore.save({
        ...run,
        activeTaskId: "task_version_mismatch",
        blockingReason: {
          kind: "waiting_approval",
          message: "apply_patch delete_file src/version-mismatch.ts",
        },
      });
      await ctx.stores.taskStore.save({
        taskId: "task_version_mismatch",
        threadId: thread.threadId,
        runId: run.runId,
        summary: "Delete mismatched file after approval",
        status: "blocked",
        blockingReason: {
          kind: "waiting_approval",
          message: "apply_patch delete_file src/version-mismatch.ts",
        },
      });
      await ctx.stores.approvalStore.save(
        createApprovalRequest({
          approvalRequestId: "approval_version_mismatch",
          threadId: thread.threadId,
          runId: run.runId,
          taskId: "task_version_mismatch",
          toolCallId: "task_version_mismatch:apply_patch",
          toolRequest: {
            toolCallId: "task_version_mismatch:apply_patch",
            threadId: thread.threadId,
            runId: run.runId,
            taskId: "task_version_mismatch",
            toolName: "apply_patch",
            args: {},
            action: "delete_file",
            path: filePath,
            changedFiles: 1,
          },
          summary: "apply_patch delete_file src/version-mismatch.ts",
          risk: "apply_patch.delete_file",
        }),
      );
      await ctx.stores.runStateStore.saveState({
        stateVersion: 99,
        engineVersion: "run-loop-v99",
        threadId: thread.threadId,
        runId: run.runId,
        taskId: "task_version_mismatch",
        input: "resume mismatched run-loop state",
        nextStep: "waiting_approval",
        currentWorkPackageId: "pkg_delete",
        workPackages: [
          {
            id: "pkg_delete",
            objective: "delete src/version-mismatch.ts",
            allowedTools: ["apply_patch"],
            inputRefs: ["thread:goal"],
            expectedArtifacts: ["patch:src/version-mismatch.ts"],
          },
        ],
        artifacts: [],
        latestArtifacts: [],
        pendingApproval: {
          summary: "Approval required before deleting src/version-mismatch.ts",
          approvalRequestId: "approval_version_mismatch",
        },
      });
      await ctx.stores.runStateStore.saveSuspension(
        createApprovalSuspension({
          threadId: thread.threadId,
          runId: run.runId,
          taskId: "task_version_mismatch",
          step: "execute",
          summary: "Approval required before deleting src/version-mismatch.ts",
          approvalRequestId: "approval_version_mismatch",
        }),
      );

      const result = await ctx.controlPlane.approveRequest("approval_version_mismatch");
      if (result.resumeDisposition !== "not_resumable") {
        throw new Error("version mismatch resume did not return not_resumable");
      }
      return {
        threadId: thread.threadId,
        finalResult: result,
      };
    },
  },
  {
    id: "restart-resume-lineage-stable",
    version: 1,
    family: "recovery-path",
    summary: "restart resume keeps run-task lineage stable through completion",
    setup: "an interrupted run is followed by a completed system resume run with a correctly linked task",
    steps: ["seed interrupted run", "seed resumed completed run", "seed completed task", "collect lineage"],
    expectedControlSemantics: {
      requiresApproval: false,
      expectedDecision: "none",
      expectedGraphResume: false,
      expectedRecoveryMode: "none",
    },
    expectedOutcome: {
      terminalRunStatus: "completed",
      terminalTaskStatus: "completed",
      expectedSummaryIncludes: ["Recovered cleanly after restart"],
      expectedApprovalCount: 0,
      expectedPendingApprovalCount: 0,
      expectedToolCallCount: 0,
    },
    createModelGateway() {
      return createHappyPathGateway();
    },
    async run({ ctx, workspaceRoot }) {
      const thread = createThread("thread_lineage_resume_path", workspaceRoot, ctx.config.projectId);
      await ctx.stores.threadStore.save(thread);

      const interruptedRun = transitionRun(
        transitionRun(
          createRun({
            runId: "run_lineage_interrupted",
            threadId: thread.threadId,
            trigger: "interrupt_resume",
            inputText: "recover lineage after restart",
          }),
          "running",
        ),
        "interrupted",
      );
      const resumedRun = transitionRun(
        transitionRun(
          createRun({
            runId: "run_lineage_resumed",
            threadId: thread.threadId,
            trigger: "system_resume",
            inputText: "resume after restart",
          }),
          "running",
        ),
        "completed",
      );

      await ctx.stores.runStore.save(interruptedRun);
      await ctx.stores.runStore.save({
        ...resumedRun,
        activeTaskId: "task_lineage_resumed",
        resultSummary: "Recovered cleanly after restart",
      });
      await ctx.stores.taskStore.save({
        taskId: "task_lineage_resumed",
        threadId: thread.threadId,
        runId: resumedRun.runId,
        summary: "Recover after restart without drift",
        status: "completed",
      });

      return {
        threadId: thread.threadId,
      };
    },
  },
  {
    id: "legacy-checkpoint-human-recovery",
    version: 1,
    family: "recovery-path",
    summary: "legacy checkpoint invalidation blocks the run into human recovery on the next boot",
    setup: "legacy graph checkpoint rows exist for a waiting-approval run before runtime boot",
    steps: ["seed run/task/checkpoint", "restart app context", "collect blocked recovery state"],
    expectedControlSemantics: {
      requiresApproval: false,
      expectedDecision: "none",
      expectedGraphResume: false,
      expectedRecoveryMode: "human_recovery",
    },
    expectedOutcome: {
      terminalRunStatus: "blocked",
      terminalTaskStatus: "blocked",
      expectedSummaryIncludes: [],
      expectedApprovalCount: 0,
      expectedPendingApprovalCount: 0,
      expectedToolCallCount: 0,
    },
    createModelGateway() {
      return createHappyPathGateway();
    },
    async run({ ctx, workspaceRoot, dataDir }) {
      const filePath = path.join(workspaceRoot, "src", "legacy-delete.ts");
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "export const legacyDelete = true;\n");

      const thread = createThread("thread_legacy_checkpoint_path", workspaceRoot, ctx.config.projectId);
      await ctx.stores.threadStore.save(thread);
      const run = transitionRun(
        transitionRun(
          createRun({
            runId: "run_legacy_checkpoint",
            threadId: thread.threadId,
            trigger: "approval_resume",
            inputText: "legacy checkpoint run",
          }),
          "running",
        ),
        "waiting_approval",
      );
      await ctx.stores.runStore.save({
        ...run,
        activeTaskId: "task_legacy_checkpoint",
        blockingReason: {
          kind: "waiting_approval",
          message: "legacy checkpoint blocked state",
        },
      });
      await ctx.stores.taskStore.save({
        taskId: "task_legacy_checkpoint",
        threadId: thread.threadId,
        runId: run.runId,
        summary: "Delete legacy file",
        status: "blocked",
        blockingReason: {
          kind: "waiting_approval",
          message: "legacy checkpoint blocked state",
        },
      });

      const seedDb = createSqlite(dataDir);
      migrateSqlite(seedDb);
      seedDb.run(`
        CREATE TABLE IF NOT EXISTS checkpoints (
          thread_id TEXT NOT NULL,
          checkpoint_ns TEXT NOT NULL DEFAULT '',
          checkpoint_id TEXT NOT NULL,
          parent_checkpoint_id TEXT,
          type TEXT,
          checkpoint BLOB,
          metadata BLOB,
          PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
        )
      `);
      seedDb.run(`
        CREATE TABLE IF NOT EXISTS writes (
          thread_id TEXT NOT NULL,
          checkpoint_ns TEXT NOT NULL DEFAULT '',
          checkpoint_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          idx INTEGER NOT NULL,
          channel TEXT NOT NULL,
          type TEXT,
          value BLOB,
          PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
        )
      `);
      seedDb.run(
        `INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)
         VALUES (?, '', ?, NULL, 'json', x'7B7D', x'7B7D')`,
        [thread.threadId, "checkpoint_legacy_1"],
      );
      seedDb.close();

      const recoveredContext = await createAppContext({
        workspaceRoot,
        dataDir,
        modelGateway: createHappyPathGateway(),
      });

      return {
        threadId: thread.threadId,
        postRunContext: recoveredContext,
      };
    },
  },
];

export function getEvalSuiteScenarios(suiteId: string): EvalScenario[] {
  if (suiteId === CORE_EVAL_SUITE_ID) {
    return coreEvalScenarios;
  }

  throw new Error(`Unknown eval suite: ${suiteId}`);
}

export function findEvalScenario(suiteId: string, scenarioId: string): EvalScenario | undefined {
  return getEvalSuiteScenarios(suiteId).find((scenario) => scenario.id === scenarioId);
}
