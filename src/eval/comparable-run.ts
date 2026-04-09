import type { ApprovalRequest } from "../domain/approval";
import type { Event } from "../domain/event";
import type { Run } from "../domain/run";
import type { Task } from "../domain/task";
import type { Thread } from "../domain/thread";
import type { ExecutionLedgerEntry } from "../persistence/ports/execution-ledger-port";
import { evalComparableRunSchema, type EvalComparableRun } from "./eval-schema";

type NormalizeComparableRunInput = {
  thread: Thread;
  runs: Run[];
  tasks: Task[];
  approvals: ApprovalRequest[];
  events: Event[];
  ledgerEntries: ExecutionLedgerEntry[];
};

function requireAlias(map: Map<string, string>, id: string, kind: string): string {
  const alias = map.get(id);
  if (!alias) {
    throw new Error(`Missing ${kind} alias for ${id}`);
  }
  return alias;
}

function normalizeWorkspacePath(text: string | undefined, workspaceRoot: string): string | undefined {
  if (!text) {
    return undefined;
  }

  const normalizedRoot = workspaceRoot.replace(/\\/g, "/");
  return text.replaceAll(normalizedRoot, "<workspace>");
}

function createAliasMap(values: readonly string[], prefix: string): Map<string, string> {
  return new Map(values.map((value, index) => [value, `${prefix}_${index + 1}`]));
}

function getBlockingKind(input?: { kind: string } | undefined): "waiting_approval" | "human_recovery" | "environment_block" | undefined {
  if (!input) {
    return undefined;
  }
  if (input.kind === "waiting_approval" || input.kind === "human_recovery" || input.kind === "environment_block") {
    return input.kind;
  }
  return undefined;
}

function getDuplicateAliases(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

export function normalizeComparableRun(input: NormalizeComparableRunInput): EvalComparableRun {
  const runAliasMap = createAliasMap(input.runs.map((run) => run.runId), "run");
  const taskAliasMap = createAliasMap(input.tasks.map((task) => task.taskId), "task");
  const approvalAliasMap = createAliasMap(input.approvals.map((approval) => approval.approvalRequestId), "approval");
  const toolCallAliasMap = createAliasMap(
    Array.from(new Set([
      ...input.approvals.map((approval) => approval.toolCallId),
      ...input.ledgerEntries.map((entry) => entry.toolCallId),
    ])),
    "tool_call",
  );

  const latestRun = input.runs.at(-1);
  const latestTask = input.tasks.at(-1);
  const resolution = input.approvals.some((approval) => approval.status === "rejected")
    ? "rejected"
    : input.approvals.some((approval) => approval.status === "approved")
      ? "approved"
      : "none";
  const rejectionReason = resolution === "rejected"
    ? input.runs
        .map((run) => run.inputText ?? run.resultSummary)
        .find((value) => typeof value === "string" && value.includes("Tool approval was rejected for proposal"))
    : undefined;
  const reroutedToPlanner = Boolean(
    rejectionReason
    && input.runs.some(
      (run) => run.trigger === "user_input" && typeof run.inputText === "string" && run.inputText.includes("Tool approval was rejected for proposal"),
    ),
  );
  const toolExecutedCount = input.events.filter((event) => event.type === "tool.executed").length;
  const graphResumeDetected = resolution === "approved" ? toolExecutedCount > 0 : reroutedToPlanner;

  const completedEntries = input.ledgerEntries.filter((entry) => entry.status === "completed");
  const duplicateCompletedToolCallAliases = getDuplicateAliases(
    completedEntries
      .map((entry) => requireAlias(toolCallAliasMap, entry.toolCallId, "tool call"))
      .filter((alias): alias is string => Boolean(alias)),
  );

  return evalComparableRunSchema.parse({
    runtimeRefs: {
      threadId: input.thread.threadId,
      runs: Object.fromEntries(Array.from(runAliasMap.entries()).map(([actualId, alias]) => [alias, actualId])),
      tasks: Object.fromEntries(Array.from(taskAliasMap.entries()).map(([actualId, alias]) => [alias, actualId])),
      approvals: Object.fromEntries(Array.from(approvalAliasMap.entries()).map(([actualId, alias]) => [alias, actualId])),
      toolCalls: Object.fromEntries(Array.from(toolCallAliasMap.entries()).map(([actualId, alias]) => [alias, actualId])),
    },
    terminalOutcome: {
      threadStatus: input.thread.status,
      latestRunAlias: latestRun ? requireAlias(runAliasMap, latestRun.runId, "run") : undefined,
      latestRunStatus: latestRun?.status,
      latestTaskAlias: latestTask ? requireAlias(taskAliasMap, latestTask.taskId, "task") : undefined,
      latestTaskStatus: latestTask?.status,
      pendingApprovalCount: input.approvals.filter((approval) => approval.status === "pending").length,
      summary: normalizeWorkspacePath(latestRun?.resultSummary, input.thread.workspaceRoot),
    },
    runLineage: input.runs.map((run) => ({
      alias: requireAlias(runAliasMap, run.runId, "run"),
      trigger: run.trigger,
      status: run.status,
      activeTaskAlias: run.activeTaskId ? requireAlias(taskAliasMap, run.activeTaskId, "task") : undefined,
      blockingKind: getBlockingKind(run.blockingReason),
      summary: normalizeWorkspacePath(run.resultSummary, input.thread.workspaceRoot),
      inputText: normalizeWorkspacePath(run.inputText, input.thread.workspaceRoot),
    })),
    taskLineage: input.tasks.map((task) => ({
      alias: requireAlias(taskAliasMap, task.taskId, "task"),
      runAlias: requireAlias(runAliasMap, task.runId, "run"),
      status: task.status,
      summary: task.summary,
      blockingKind: getBlockingKind(task.blockingReason),
    })),
    approvalFlow: {
      requested: input.approvals.map((approval) => ({
        alias: requireAlias(approvalAliasMap, approval.approvalRequestId, "approval"),
        runAlias: requireAlias(runAliasMap, approval.runId, "run"),
        taskAlias: requireAlias(taskAliasMap, approval.taskId, "task"),
        status: approval.status,
        summary: normalizeWorkspacePath(approval.summary, input.thread.workspaceRoot),
        toolName: approval.toolRequest.toolName,
        action: approval.toolRequest.action,
      })),
      resolution,
      graphResumeDetected,
      rejectionReason: normalizeWorkspacePath(rejectionReason, input.thread.workspaceRoot),
      reroutedToPlanner,
    },
    recoveryFlow: {
      humanRecoveryTriggered: input.thread.recoveryFacts?.blocking?.kind === "human_recovery"
        || input.tasks.some((task) => task.blockingReason?.kind === "human_recovery"),
      uncertainExecutionCount: input.ledgerEntries.filter((entry) => entry.status === "unknown_after_crash").length,
      blockedTaskAliases: input.tasks
        .filter((task) => task.status === "blocked")
        .map((task) => taskAliasMap.get(task.taskId))
        .filter((alias): alias is string => Boolean(alias)),
      interruptedRunAliases: input.runs
        .filter((run) => run.status === "interrupted")
        .map((run) => runAliasMap.get(run.runId))
        .filter((alias): alias is string => Boolean(alias)),
      resumedRunAliases: input.runs
        .filter((run) => (run.trigger === "interrupt_resume" || run.trigger === "system_resume") && run.status !== "interrupted")
        .map((run) => requireAlias(runAliasMap, run.runId, "run"))
        .filter((alias): alias is string => Boolean(alias)),
    },
    sideEffects: {
      totalEntries: input.ledgerEntries.length,
      unknownAfterCrashCount: input.ledgerEntries.filter((entry) => entry.status === "unknown_after_crash").length,
      completedEntries: completedEntries.map((entry) => ({
        taskAlias: requireAlias(taskAliasMap, entry.taskId, "task"),
        runAlias: entry.runId ? requireAlias(runAliasMap, entry.runId, "run") : undefined,
        toolCallAlias: requireAlias(toolCallAliasMap, entry.toolCallId, "tool call"),
        toolName: entry.toolName,
        status: entry.status,
      })),
      duplicateCompletedToolCallAliases,
    },
    eventMilestones: {
      eventTypes: input.events.map((event) => event.type),
      toolExecutedCount,
      toolFailedCount: input.events.filter((event) => event.type === "tool.failed").length,
      threadBlockedCount: input.events.filter((event) => event.type === "thread.blocked").length,
      taskCompletedCount: input.events.filter((event) => event.type === "task.completed").length,
      taskFailedCount: input.events.filter((event) => event.type === "task.failed").length,
      taskUpdatedBlockedCount: input.events.filter(
        (event) => event.type === "task.updated" && event.payload?.status === "blocked",
      ).length,
    },
  });
}
