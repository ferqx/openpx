/**
 * @module harness/core/projection/session-view-projector
 * 会话视图投影器（session view projector）。
 *
 * 将底层的持久化状态整理成 surface 可直接消费的投影视图，
 * 包括协作线摘要、步骤列表、审批列表和执行状态。
 *
 * 术语对照：projection=投影视图，session=会话，
 * thread=协作线，run=执行尝试，task=具体步骤
 */
import type { ApprovalRequest } from "../../../domain/approval";
import type { Run } from "../../../domain/run";
import type { Task } from "../../../domain/task";
import type { Thread } from "../../../domain/thread";
import type { Worker } from "../../../domain/worker";
import type { DerivedThreadView } from "../../../control/context/thread-compaction-types";
import type { ThreadMode } from "../../../control/agents/thread-mode";
import type { PlanDecisionRequest } from "../../../runtime/planning/planner-result";
import type { AnswerView } from "../../protocol/views/answer-view";
import type { MessageView } from "../../protocol/views/message-view";
import type { WorkerView } from "../../protocol/views/worker-view";

/** 协作线摘要——用于 surface 线程面板显示 */
export type SessionThreadSummary = {
  threadId: string;
  status: string;
  threadMode: ThreadMode;
  activeRunId?: string;
  activeRunStatus?: Run["status"];
  narrativeSummary?: string;
  pendingApprovalCount?: number;
  blockingReasonKind?: "waiting_approval" | "plan_decision" | "human_recovery";
};

/** 投影后的会话结果——surface 消费的完整状态视图 */
export type ProjectedSessionResult = DerivedThreadView & {
  status: "idle" | "active" | "completed" | "waiting_approval" | "blocked" | "failed" | "interrupted";
  threadId: string;
  threadMode: ThreadMode;
  resumeDisposition?: "resumed" | "already_resolved" | "already_consumed" | "invalidated" | "not_resumable";
  finalResponse?: string;
  executionSummary?: string;
  verificationSummary?: string;
  pauseSummary?: string;
  latestExecutionStatus?: "running" | "waiting_approval" | "blocked" | "completed";
  recommendationReason?: string;
  planDecision?: PlanDecisionRequest;
  approvals?: ApprovalRequest[];
  tasks?: Task[];
  answers?: AnswerView[];
  messages?: MessageView[];
  workers?: WorkerView[];
  workspaceRoot?: string;
  projectId?: string;
  threads?: SessionThreadSummary[];
};

/** 从协作线恢复事实构建稳定的会话产物（答案、消息、工作单元） */
export function buildStableSessionArtifacts(input: {
  thread: {
    threadId: string;
    recoveryFacts?: DerivedThreadView["recoveryFacts"];
  };
  workers?: Worker[];
}): {
  answers: AnswerView[];
  messages: MessageView[];
  workers: WorkerView[];
} {
  const latestAnswer = input.thread.recoveryFacts?.latestDurableAnswer;
  const answers: AnswerView[] = latestAnswer
    ? [
        {
          answerId: latestAnswer.answerId,
          threadId: input.thread.threadId,
          content: latestAnswer.summary,
        },
      ]
    : [];

  const messages: MessageView[] = (input.thread.recoveryFacts?.conversationHistory ?? []).map((message) => ({
    messageId: message.messageId,
    threadId: input.thread.threadId,
    role: message.role,
    content: message.content,
  }));

  const workers: WorkerView[] = (input.workers ?? []).map((worker) => ({
    workerId: worker.workerId,
    threadId: worker.threadId,
    taskId: worker.taskId,
    role: worker.role,
    status: worker.status,
    spawnReason: worker.spawnReason,
    startedAt: worker.startedAt,
    endedAt: worker.endedAt,
    resumeToken: worker.resumeToken,
  }));

  return {
    answers,
    messages,
    workers,
  };
}

/** 根据最新运行状态推导会话投影的执行状态 */
export function deriveProjectedExecutionStatus(
  latestRun: Run | undefined,
  fallbackStatus: ProjectedSessionResult["status"] | Thread["status"],
): ProjectedSessionResult["status"] {
  if (!latestRun) {
    return fallbackStatus === "archived" ? "completed" : fallbackStatus;
  }

  switch (latestRun.status) {
    case "created":
    case "running":
      return "active";
    case "failed":
    case "interrupted":
      return "blocked";
    default:
      return latestRun.status;
  }
}

/** 组装完整的投影会话结果 */
export async function projectSessionResult(input: {
  thread: {
    threadId: string;
    status?: Thread["status"];
    threadMode: ThreadMode;
    recoveryFacts?: DerivedThreadView["recoveryFacts"];
    narrativeState?: DerivedThreadView["narrativeState"];
    workingSetWindow?: DerivedThreadView["workingSetWindow"];
  };
  status: ProjectedSessionResult["status"];
  workspaceRoot?: string;
  projectId?: string;
  finalResponse?: string;
  resumeDisposition?: ProjectedSessionResult["resumeDisposition"];
  executionSummary?: string;
  verificationSummary?: string;
  pauseSummary?: string;
  latestExecutionStatus?: ProjectedSessionResult["latestExecutionStatus"];
  recommendationReason?: string;
  planDecision?: PlanDecisionRequest;
  approvals?: ApprovalRequest[];
  tasks?: Task[];
  answers?: AnswerView[];
  messages?: MessageView[];
  workers?: WorkerView[];
  threads?: SessionThreadSummary[];
}): Promise<ProjectedSessionResult> {
  return {
    recoveryFacts: input.thread.recoveryFacts,
    narrativeState: input.thread.narrativeState,
    workingSetWindow: input.thread.workingSetWindow,
    status: input.status,
    threadId: input.thread.threadId,
    threadMode: input.thread.threadMode,
    finalResponse: input.finalResponse,
    resumeDisposition: input.resumeDisposition,
    executionSummary: input.executionSummary,
    verificationSummary: input.verificationSummary,
    pauseSummary: input.pauseSummary,
    latestExecutionStatus: input.latestExecutionStatus,
    recommendationReason: input.recommendationReason,
    planDecision: input.planDecision,
    approvals: input.approvals,
    tasks: input.tasks,
    answers: input.answers,
    messages: input.messages,
    workers: input.workers,
    workspaceRoot: input.workspaceRoot,
    projectId: input.projectId,
    threads: input.threads,
  };
}
