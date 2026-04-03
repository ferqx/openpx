import type { RuntimeSnapshot } from "../../runtime/service/runtime-types";

export type RuntimeSessionState = {
  status: "completed" | "waiting_approval" | "blocked";
  threadId?: string;
  summary: string;
  tasks: RuntimeSnapshot["tasks"];
  approvals: RuntimeSnapshot["pendingApprovals"];
  workspaceRoot: string;
  projectId: string;
  blockingReason?: RuntimeSnapshot["blockingReason"];
  recommendationReason?: string;
  narrativeSummary?: string;
  threads: RuntimeSnapshot["threads"];
};

export function deriveRuntimeSession(snapshot: RuntimeSnapshot): RuntimeSessionState {
  const blockingReason =
    snapshot.blockingReason ??
    snapshot.tasks.find((task) => task.status === "blocked" && task.blockingReason)?.blockingReason;
  const status = snapshot.pendingApprovals.length > 0 ? "waiting_approval" : blockingReason ? "blocked" : "completed";

  return {
    status,
    threadId: snapshot.activeThreadId,
    summary: snapshot.answers.at(-1)?.content ?? blockingReason?.message ?? snapshot.narrativeSummary ?? "Awaiting answer",
    tasks: snapshot.tasks,
    approvals: snapshot.pendingApprovals,
    workspaceRoot: snapshot.workspaceRoot,
    projectId: snapshot.projectId,
    blockingReason,
    recommendationReason: snapshot.recommendationReason,
    narrativeSummary: snapshot.narrativeSummary,
    threads: snapshot.threads,
  };
}
