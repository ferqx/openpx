import type { Run } from "../domain/run";
import type { Thread } from "../domain/thread";
import type { ApprovalRequest } from "../domain/approval";
import type { Task } from "../domain/task";
import type { DerivedThreadView } from "../control/context/thread-compaction-types";

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
  workspaceRoot?: string;
  projectId?: string;
  threads?: SessionThreadSummary[];
};

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
    workspaceRoot: input.workspaceRoot,
    projectId: input.projectId,
    threads: input.threads,
  };
}
