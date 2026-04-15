import { INTERRUPT, isInterrupted } from "@langchain/langgraph";
import type { ApprovalRequest } from "../domain/approval";
import type { Run } from "../domain/run";
import { createRun } from "../domain/run";
import type { ControlTask } from "../control/tasks/task-types";
import type { ResumeControl } from "../runtime/graph/root/resume-control";
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

/** graph 返回值的最小兼容形状：这里只关心控制面生命周期需要的字段 */
type RootTaskGraphResultLike = {
  mode?: string;
  finalResponse?: string;
  executionSummary?: string;
  verificationSummary?: string;
  pauseSummary?: string;
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
// 只负责 root task 在 graph 调用前后的生命周期推进，不负责 graph 本身。
export async function prepareRootTaskExecution(
  deps: RootTaskPreparationDeps,
  threadId: string,
  inputValue: string | ResumeControl,
): Promise<RootTaskPreparation> {
  const latestRun = await deps.getLatestRun(threadId);
  // 只有 waiting_approval / interrupted 的 run 才能进入 resume 分支；
  // 其他状态一律视为新一轮输入，重新创建 run 与 root task。
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

  // fresh invoke 必须显式创建 root task，并把它绑定到新 run 上，
  // 这样后续 graph、approval 和投影视图都能围绕同一个 taskId 展开。
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
  // 三种情况都会把 run 停在 waiting_approval：
  // 1. 已产生待审批请求
  // 2. graph 通过 interrupt 主动要求人工介入
  // 3. graph 显式返回 waiting_approval 模式
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
  const finalResponse =
    status === "completed"
      ? (graphResult as RootTaskGraphResultLike)?.finalResponse
      : undefined;
  const executionSummary = (graphResult as RootTaskGraphResultLike)?.executionSummary;
  const verificationSummary = (graphResult as RootTaskGraphResultLike)?.verificationSummary;
  const pauseSummary = status === "waiting_approval"
    ? String(
        (graphResult as RootTaskGraphResultLike)?.pauseSummary
        ?? interruptValue?.summary
        ?? recommendationReason
        ?? "Execution paused.",
      )
    : undefined;

  // run 的 blockingReason 代表“为什么现在不能继续自动推进”。
  // 有审批时标记 waiting_approval；否则说明进入了人工恢复场景。
  await deps.updateRunStatus(run, status === "waiting_approval" ? "waiting_approval" : "completed", {
    activeTaskId: finalTask.taskId,
    resultSummary: finalResponse,
    blockingReason:
      status === "waiting_approval"
        ? {
            kind: approvals.length > 0 ? "waiting_approval" : "human_recovery",
            message: pauseSummary ?? "Execution paused.",
          }
        : undefined,
    endedAt: status === "waiting_approval" ? undefined : new Date().toISOString(),
  });

  return {
    status,
    task: finalTask,
    approvals,
    finalResponse,
    executionSummary,
    verificationSummary,
    pauseSummary,
    recommendationReason,
    lastCompletedToolCallId: (graphResult as RootTaskGraphResultLike)?.lastCompletedToolCallId,
    lastCompletedToolName: (graphResult as RootTaskGraphResultLike)?.lastCompletedToolName,
    pendingToolCallId: (graphResult as RootTaskGraphResultLike)?.pendingToolCallId,
    pendingToolName: (graphResult as RootTaskGraphResultLike)?.pendingToolName,
  };
}
