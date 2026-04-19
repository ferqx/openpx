import type { ApprovalRequest } from "../domain/approval";
import type { Run } from "../domain/run";
import { createRun } from "../domain/run";
import type { ControlTask } from "../control/tasks/task-types";
import type { ContinuationEnvelope } from "../harness/core/run-loop/continuation";
import type { RunLoopEngineResult } from "../harness/core/run-loop/run-loop-engine";
import { prefixedUuid } from "../shared/id-generators";
import { ensureControlTask, resumeInputText } from "./control-plane-support";

/** root task 启动前需要的依赖：负责查 run、创建 task、推进状态 */
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

/** root task 启动阶段的产物：统一返回 run/task/text，供 graph 调用层继续使用 */
type RootTaskPreparation = {
  isResume: boolean;
  run: Run;
  task: ControlTask;
  text: string;
};

/** root task 收尾阶段需要的依赖：只关心审批列表与最终状态写回 */
type RootTaskFinalizationDeps = {
  listPendingApprovals: (threadId: string) => Promise<ApprovalRequest[]>;
  saveTaskStatus: (task: ControlTask, status: ControlTask["status"]) => Promise<ControlTask>;
  updateRunStatus: (run: Run, status: Run["status"], patch?: Partial<Run>) => Promise<Run>;
};

export type RootTaskFinalizationResult = {
  status: "waiting_approval" | "completed" | "blocked";
  task: ControlTask;
  approvals: ApprovalRequest[];
  resumeDisposition?: RunLoopEngineResult["resumeDisposition"];
  finalResponse?: string;
  executionSummary?: string;
  verificationSummary?: string;
  pauseSummary?: string;
  recommendationReason?: string;
  lastCompletedToolCallId?: string;
  lastCompletedToolName?: string;
  pendingToolCallId?: string;
  pendingToolName?: string;
};

// run/task 生命周期辅助层：
// 只负责 root task 在 engine 调用前后的生命周期推进，不负责 run-loop 本身。
export async function prepareRootTaskExecution(
  deps: RootTaskPreparationDeps,
  threadId: string,
  inputValue: string | ContinuationEnvelope,
): Promise<RootTaskPreparation> {
  const latestRun = await deps.getLatestRun(threadId);
  const isResume = typeof inputValue !== "string";
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
      inputText: text.length > 0 ? text : run.inputText,
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

  // fresh start 必须显式创建 root task，并把它绑定到新 run 上，
  // 这样后续 approval 和投影视图都能围绕同一个 taskId 展开。
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
  inputValue: string | ContinuationEnvelope,
  threadId: string,
  run: Run,
  task: ControlTask,
  engineResult: RunLoopEngineResult,
): Promise<RootTaskFinalizationResult> {
  const approvals = await deps.listPendingApprovals(threadId);
  const status: "waiting_approval" | "completed" | "blocked" =
    engineResult.status === "blocked"
      ? "blocked"
      : engineResult.status === "waiting_approval" || approvals.length > 0
        ? "waiting_approval"
        : "completed";

  const finalTask = await deps.saveTaskStatus(
    task,
    status === "completed" ? "completed" : "blocked",
  );
  const recommendationReason =
    status !== "completed" && approvals.length === 0
      ? engineResult.recommendationReason
      : undefined;
  const finalResponse = status === "completed" ? engineResult.finalResponse : undefined;
  const executionSummary = engineResult.executionSummary;
  const verificationSummary = engineResult.verificationSummary;
  const pauseSummary = status !== "completed"
    ? String(
        engineResult.pauseSummary
        ?? recommendationReason
        ?? "Execution paused.",
      )
    : undefined;

  // run 的 blockingReason 代表“为什么现在不能继续自动推进”。
  // 有审批时标记 waiting_approval；否则说明进入了人工恢复场景。
  await deps.updateRunStatus(
    run,
    status === "completed" ? "completed" : status === "waiting_approval" ? "waiting_approval" : "blocked",
    {
      activeTaskId: finalTask.taskId,
      resultSummary: finalResponse,
      blockingReason:
        status !== "completed"
          ? {
            kind: status === "waiting_approval" && approvals.length > 0 ? "waiting_approval" : "human_recovery",
            message: pauseSummary ?? "Execution paused.",
          }
        : undefined,
      endedAt: status === "completed" ? new Date().toISOString() : undefined,
    },
  );

  return {
    status,
    task: finalTask,
    approvals,
    resumeDisposition: engineResult.resumeDisposition,
    finalResponse,
    executionSummary,
    verificationSummary,
    pauseSummary,
    recommendationReason,
    lastCompletedToolCallId: engineResult.lastCompletedToolCallId,
    lastCompletedToolName: engineResult.lastCompletedToolName,
    pendingToolCallId: engineResult.pendingToolCallId,
    pendingToolName: engineResult.pendingToolName,
  };
}
