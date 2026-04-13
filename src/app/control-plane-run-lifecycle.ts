import { INTERRUPT, isInterrupted } from "@langchain/langgraph";
import type { ApprovalRequest } from "../domain/approval";
import type { Run } from "../domain/run";
import { createRun } from "../domain/run";
import type { ControlTask } from "../control/tasks/task-types";
import type { ResumeControl } from "../runtime/graph/root/resume-control";
import { prefixedUuid } from "../shared/id-generators";
import { ensureControlTask, resumeInputText } from "./control-plane-support";

type RootTaskPreparationDeps = {
  getLatestRun: (threadId: string) => Promise<Run | undefined>;
  listTasksByThread: (threadId: string) => Promise<Array<{
    taskId: string;
    threadId: string;
    runId?: string;
    summary?: string;
    status: ControlTask["status"];
  }>>;
  saveRun: (run: Run) => Promise<Run>;
  updateRunStatus: (run: Run, status: Run["status"], patch?: Partial<Run>) => Promise<Run>;
  createRootTask: (threadId: string, summary: string, runId?: string) => Promise<ControlTask>;
  saveTaskStatus: (task: ControlTask, status: ControlTask["status"]) => Promise<ControlTask>;
};

type RootTaskPreparation = {
  isResume: boolean;
  run: Run;
  task: ControlTask;
  text: string;
};

type RootTaskFinalizationDeps = {
  listPendingApprovals: (threadId: string) => Promise<ApprovalRequest[]>;
  saveTaskStatus: (task: ControlTask, status: ControlTask["status"]) => Promise<ControlTask>;
  updateRunStatus: (run: Run, status: Run["status"], patch?: Partial<Run>) => Promise<Run>;
};

type RootTaskGraphResultLike = {
  mode?: string;
  summary?: string;
  recommendationReason?: string;
  lastCompletedToolCallId?: string;
  lastCompletedToolName?: string;
  pendingToolCallId?: string;
  pendingToolName?: string;
} | undefined;

export type RootTaskFinalizationResult = {
  status: "waiting_approval" | "completed";
  task: ControlTask;
  approvals: ApprovalRequest[];
  summary: string;
  recommendationReason?: string;
  lastCompletedToolCallId?: string;
  lastCompletedToolName?: string;
  pendingToolCallId?: string;
  pendingToolName?: string;
};

// run/task 生命周期辅助层：
// 只负责 root task 在 graph 调用前后的生命周期推进，不负责 graph 本身。
export async function prepareRootTaskExecution(
  deps: RootTaskPreparationDeps,
  threadId: string,
  inputValue: string | ResumeControl,
): Promise<RootTaskPreparation> {
  const latestRun = await deps.getLatestRun(threadId);
  const isResume = latestRun?.status === "waiting_approval" || latestRun?.status === "interrupted";
  const text = resumeInputText(inputValue);

  if (isResume) {
    if (!latestRun) {
      throw new Error(`no run found for thread ${threadId} to resume`);
    }

    const run = await deps.updateRunStatus(latestRun, "running");
    const tasks = await deps.listTasksByThread(threadId);
    const lastTask = tasks[tasks.length - 1];
    if (!lastTask) {
      throw new Error(`no tasks found for thread ${threadId} to resume`);
    }

    const task = await deps.saveTaskStatus(ensureControlTask(lastTask), "running");
    const runWithActiveTask = await deps.saveRun({
      ...run,
      activeTaskId: task.taskId,
    });

    return {
      isResume: true,
      run: runWithActiveTask,
      task,
      text,
    };
  }

  let run = await deps.saveRun(
    createRun({
      runId: prefixedUuid("run"),
      threadId,
      trigger: "user_input",
      inputText: text,
    }),
  );
  run = await deps.updateRunStatus(run, "running");

  let task = await deps.createRootTask(threadId, text, run.runId);
  task = await deps.saveTaskStatus(task, "running");

  run = await deps.saveRun({
    ...run,
    activeTaskId: task.taskId,
  });

  return {
    isResume: false,
    run,
    task,
    text,
  };
}

export async function finalizeRootTaskExecution(
  deps: RootTaskFinalizationDeps,
  inputValue: string | ResumeControl,
  threadId: string,
  run: Run,
  task: ControlTask,
  graphResult: RootTaskGraphResultLike | unknown,
): Promise<RootTaskFinalizationResult> {
  const approvals = await deps.listPendingApprovals(threadId);

  let status: "waiting_approval" | "completed" = "completed";
  if (approvals.length > 0) {
    status = "waiting_approval";
  } else if (isInterrupted(graphResult)) {
    status = "waiting_approval";
  } else if ((graphResult as RootTaskGraphResultLike)?.mode === "waiting_approval") {
    status = "waiting_approval";
  }

  const finalTask = await deps.saveTaskStatus(task, status === "waiting_approval" ? "blocked" : "completed");
  const interruptValue = isInterrupted(graphResult)
    ? (graphResult[INTERRUPT][0]?.value as { summary?: string } | undefined)
    : undefined;
  const recommendationReason =
    status === "waiting_approval" && approvals.length === 0
      ? (graphResult as RootTaskGraphResultLike)?.recommendationReason
      : undefined;
  const summary = isInterrupted(graphResult)
    ? String(interruptValue?.summary ?? resumeInputText(inputValue))
    : String(
        (graphResult as RootTaskGraphResultLike)?.summary ??
        recommendationReason ??
        resumeInputText(inputValue),
      );

  await deps.updateRunStatus(run, status === "waiting_approval" ? "waiting_approval" : "completed", {
    activeTaskId: finalTask.taskId,
    resultSummary: summary,
    blockingReason:
      status === "waiting_approval"
        ? {
            kind: approvals.length > 0 ? "waiting_approval" : "human_recovery",
            message: String(interruptValue?.summary ?? recommendationReason ?? "Execution paused."),
          }
        : undefined,
    endedAt: status === "waiting_approval" ? undefined : new Date().toISOString(),
  });

  return {
    status,
    task: finalTask,
    approvals,
    summary,
    recommendationReason,
    lastCompletedToolCallId: (graphResult as RootTaskGraphResultLike)?.lastCompletedToolCallId,
    lastCompletedToolName: (graphResult as RootTaskGraphResultLike)?.lastCompletedToolName,
    pendingToolCallId: (graphResult as RootTaskGraphResultLike)?.pendingToolCallId,
    pendingToolName: (graphResult as RootTaskGraphResultLike)?.pendingToolName,
  };
}
