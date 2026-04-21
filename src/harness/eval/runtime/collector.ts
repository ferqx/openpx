import { createSqlite } from "../../../persistence/sqlite/sqlite-client";
import { closeSqliteHandle } from "../../../persistence/sqlite/sqlite-client";
import { migrateSqlite } from "../../../persistence/sqlite/sqlite-migrator";
import { SqliteApprovalStore } from "../../../persistence/sqlite/sqlite-approval-store";
import { SqliteAgentRunStore } from "../../../persistence/sqlite/sqlite-agent-run-store";
import { SqliteEventLog } from "../../../persistence/sqlite/sqlite-event-log";
import { SqliteExecutionLedger } from "../../../persistence/sqlite/sqlite-execution-ledger";
import { SqliteRunStateStore } from "../../../persistence/sqlite/sqlite-run-state-store";
import { SqliteRunStore } from "../../../persistence/sqlite/sqlite-run-store";
import { SqliteTaskStore } from "../../../persistence/sqlite/sqlite-task-store";
import { SqliteThreadStore } from "../../../persistence/sqlite/sqlite-thread-store";
import type { ApprovalRequest } from "../../../domain/approval";
import type { AgentRunRecord } from "../../../domain/agent-run";
import type { Event } from "../../../domain/event";
import type { Run } from "../../../domain/run";
import type { Task } from "../../../domain/task";
import type { Thread } from "../../../domain/thread";
import type { RunSuspension } from "../../core/run-loop/approval-suspension";
import type { ContinuationEnvelope } from "../../core/run-loop/continuation";
import type { RunLoopState } from "../../core/run-loop/step-types";
import { buildRuntimeSnapshot } from "../../protocol/views/runtime-snapshot-builder";
import type { RuntimeSnapshot } from "../../protocol/schemas/api-schema";
import {
  buildStableSessionArtifacts,
  deriveProjectedExecutionStatus,
  projectSessionResult,
  type ProjectedSessionResult,
  type SessionThreadSummary,
} from "../../core/projection/session-view-projector";
import { resolveConfig } from "../../../shared/config";

type ContinuationRow = {
  payload_json: string;
};

/** runtime evidence：供 replay / diff / failure report 共用的统一证据包。 */
export type RuntimeCollectedEvidence = {
  workspaceRoot: string;
  projectId: string;
  dataDir: string;
  thread?: Thread;
  latestRun?: Run;
  latestTask?: Task;
  latestRunState?: RunLoopState;
  runs: Run[];
  tasks: Task[];
  approvals: ApprovalRequest[];
  pendingApprovals: ApprovalRequest[];
  agentRuns: AgentRunRecord[];
  events: Event[];
  ledgerEntries: Awaited<ReturnType<SqliteExecutionLedger["listByThread"]>>;
  suspensions: RunSuspension[];
  continuations: ContinuationEnvelope[];
  snapshot?: RuntimeSnapshot;
  sessionProjection?: ProjectedSessionResult;
  threadSummaries: SessionThreadSummary[];
};

function parseContinuationRow(row: ContinuationRow): ContinuationEnvelope {
  const parsed = JSON.parse(row.payload_json) as ContinuationEnvelope;
  return {
    ...parsed,
    status: parsed.status ?? "created",
  };
}

/** 从 runtime sqlite 数据目录收集一条线程的系统级证据。 */
export async function collectRuntimeEvidence(input: {
  workspaceRoot: string;
  dataDir: string;
  projectId?: string;
  threadId?: string;
  runId?: string;
}): Promise<RuntimeCollectedEvidence> {
  const config = resolveConfig({
    workspaceRoot: input.workspaceRoot,
    dataDir: input.dataDir,
    projectId: input.projectId,
    allowMissingModel: true,
  });
  const db = createSqlite(input.dataDir);
  migrateSqlite(db);

  const threadStore = new SqliteThreadStore(db);
  const runStore = new SqliteRunStore(db);
  const taskStore = new SqliteTaskStore(db);
  const approvalStore = new SqliteApprovalStore(db);
  const agentRunStore = new SqliteAgentRunStore(db);
  const eventLog = new SqliteEventLog(db);
  const executionLedger = new SqliteExecutionLedger(db);
  const runStateStore = new SqliteRunStateStore(db);
  const requestedRunId = input.runId;

  try {
    const activeThread = input.threadId
      ? await threadStore.get(input.threadId)
      : requestedRunId
        ? await (async () => {
            const run = await runStore.get(requestedRunId);
            return run ? threadStore.get(run.threadId) : undefined;
          })()
        : await threadStore.getLatest({
            workspaceRoot: config.workspaceRoot,
            projectId: config.projectId,
          });

    const allThreads = await threadStore.listByScope({
      workspaceRoot: config.workspaceRoot,
      projectId: config.projectId,
    });

    if (!activeThread) {
      return {
        workspaceRoot: config.workspaceRoot,
        projectId: config.projectId,
        dataDir: input.dataDir,
        runs: [],
        tasks: [],
        approvals: [],
        pendingApprovals: [],
        agentRuns: [],
        events: [],
        ledgerEntries: [],
        suspensions: [],
        continuations: [],
        threadSummaries: [],
      };
    }

    const [runs, tasks, approvals, pendingApprovals, agentRuns, events, ledgerEntries, suspensions] = await Promise.all([
      runStore.listByThread(activeThread.threadId),
      taskStore.listByThread(activeThread.threadId),
      approvalStore.listByThread(activeThread.threadId),
      approvalStore.listPendingByThread(activeThread.threadId),
      agentRunStore.listByThread(activeThread.threadId),
      eventLog.listByThread(activeThread.threadId),
      executionLedger.listByThread(activeThread.threadId),
      runStateStore.listSuspensionsByThread(activeThread.threadId),
    ]);

    const continuations = db
      .query<ContinuationRow, [string]>(
        `SELECT payload_json
         FROM run_continuations
         WHERE thread_id = ?
         ORDER BY rowid ASC`,
      )
      .all(activeThread.threadId)
      .map(parseContinuationRow);

    const threadSummaries: SessionThreadSummary[] = await Promise.all(
      allThreads.map(async (thread) => {
        const [latestRun, threadApprovals] = await Promise.all([
          runStore.getLatestByThread(thread.threadId),
          approvalStore.listPendingByThread(thread.threadId),
        ]);
        return {
          threadId: thread.threadId,
          status: thread.status,
          threadMode: thread.threadMode,
          activeRunId: latestRun?.runId,
          activeRunStatus: latestRun?.status,
          narrativeSummary: thread.narrativeState?.threadSummary,
          pendingApprovalCount: threadApprovals.length,
          blockingReasonKind: thread.recoveryFacts?.blocking?.kind,
        };
      }),
    );

    const latestRun = input.runId
      ? runs.find((run) => run.runId === input.runId) ?? runs.at(-1)
      : runs.at(-1);
    const latestTask = latestRun?.activeTaskId
      ? tasks.find((task) => task.taskId === latestRun.activeTaskId) ?? tasks.at(-1)
      : tasks.at(-1);
    const latestRunState = latestRun ? await runStateStore.loadByRun(latestRun.runId) : undefined;

    const snapshot = buildRuntimeSnapshot({
      scope: {
        workspaceRoot: config.workspaceRoot,
        projectId: config.projectId,
      },
      activeThread,
      activeRunId: latestRun?.runId,
      threads: allThreads.map((thread) => {
        const summary = threadSummaries.find((item) => item.threadId === thread.threadId);
        return {
          ...thread,
          activeRunId: summary?.activeRunId,
          activeRunStatus: summary?.activeRunStatus,
          pendingApprovalCount: summary?.pendingApprovalCount,
          blockingReasonKind: summary?.blockingReasonKind,
        };
      }),
      runs,
      tasks,
      pendingApprovals,
      agentRuns,
      events,
      fallbackLastEventSeq: 0,
      narrativeSummary: activeThread.narrativeState?.threadSummary,
    });

    const stableArtifacts = buildStableSessionArtifacts({
      thread: {
        threadId: activeThread.threadId,
        recoveryFacts: activeThread.recoveryFacts,
      },
      agentRuns,
    });

    const sessionProjection = await projectSessionResult({
      thread: {
        threadId: activeThread.threadId,
        status: activeThread.status,
        threadMode: activeThread.threadMode,
        recoveryFacts: activeThread.recoveryFacts,
        narrativeState: activeThread.narrativeState,
        workingSetWindow: activeThread.workingSetWindow,
      },
      status: deriveProjectedExecutionStatus(latestRun, activeThread.status),
      workspaceRoot: config.workspaceRoot,
      projectId: config.projectId,
      finalResponse: stableArtifacts.answers[0]?.content,
      pauseSummary: latestRun?.blockingReason?.message,
      latestExecutionStatus: snapshot.latestExecutionStatus === "blocked" ? "completed" as const : snapshot.latestExecutionStatus,
      recommendationReason:
        latestRun?.blockingReason?.kind === "human_recovery"
          ? latestRun.blockingReason.message
          : undefined,
      approvals: pendingApprovals,
      tasks,
      answers: stableArtifacts.answers,
      messages: stableArtifacts.messages,
      agentRuns: stableArtifacts.agentRuns,
      threads: threadSummaries,
    });

    return {
      workspaceRoot: config.workspaceRoot,
      projectId: config.projectId,
      dataDir: input.dataDir,
      thread: activeThread,
      latestRun,
      latestTask,
      latestRunState,
      runs,
      tasks,
      approvals,
      pendingApprovals,
      agentRuns,
      events,
      ledgerEntries,
      suspensions,
      continuations,
      snapshot,
      sessionProjection,
      threadSummaries,
    };
  } finally {
    await threadStore.close();
    await runStore.close();
    await taskStore.close();
    await approvalStore.close();
    await agentRunStore.close();
    await eventLog.close();
    await executionLedger.close();
    await runStateStore.close();
    closeSqliteHandle(db);
  }
}
