import type { Run } from "../domain/run";
import type { Thread } from "../domain/thread";
import type { ApprovalRequest } from "../domain/approval";
import type { Task } from "../domain/task";
import type { DerivedThreadView } from "../control/context/thread-compaction-types";
import type { Worker } from "../domain/worker";
import type { AnswerView } from "../runtime/service/protocol/answer-view";
import type { MessageView } from "../runtime/service/protocol/message-view";
import type { WorkerView } from "../runtime/service/protocol/worker-view";

export type SessionThreadSummary = {
  threadId: string;
  status: string;
  activeRunId?: string;
  activeRunStatus?: Run["status"];
  narrativeSummary?: string;
  pendingApprovalCount?: number;
  blockingReasonKind?: "waiting_approval" | "human_recovery";
};

export type ProjectedSessionResult = DerivedThreadView & {
  status: "idle" | "active" | "completed" | "waiting_approval" | "blocked" | "failed" | "interrupted";
  threadId: string;
  summary?: string;
  recommendationReason?: string;
  approvals?: ApprovalRequest[];
  tasks?: Task[];
  answers?: AnswerView[];
  messages?: MessageView[];
  workers?: WorkerView[];
  workspaceRoot?: string;
  projectId?: string;
  threads?: SessionThreadSummary[];
};

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

export async function projectSessionResult(input: {
  thread: {
    threadId: string;
    status?: Thread["status"];
    recoveryFacts?: DerivedThreadView["recoveryFacts"];
    narrativeState?: DerivedThreadView["narrativeState"];
    workingSetWindow?: DerivedThreadView["workingSetWindow"];
  };
  status: ProjectedSessionResult["status"];
  workspaceRoot?: string;
  projectId?: string;
  summary?: string;
  recommendationReason?: string;
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
    summary: input.summary,
    recommendationReason: input.recommendationReason,
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
