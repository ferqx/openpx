import type { RuntimeSnapshot } from "../../runtime/service/runtime-types";

export type SessionStage = "idle" | "planning" | "awaiting_confirmation" | "executing" | "blocked";

export type RuntimeSessionState = {
  status: "completed" | "waiting_approval" | "blocked";
  stage?: SessionStage;
  threadId?: string;
  summary: string;
  tasks: RuntimeSnapshot["tasks"];
  approvals: RuntimeSnapshot["pendingApprovals"];
  answers: RuntimeSnapshot["answers"];
  messages?: RuntimeSnapshot["messages"];
  workers: RuntimeSnapshot["workers"];
  workspaceRoot: string;
  projectId: string;
  blockingReason?: RuntimeSnapshot["blockingReason"];
  recommendationReason?: string;
  narrativeSummary?: string;
  threads: RuntimeSnapshot["threads"];
};

export function formatThreadListSummary(session: Pick<RuntimeSessionState, "threadId" | "threads">): string {
  const lines = session.threads.map((thread) =>
    [
      `${thread.threadId}${thread.threadId === session.threadId ? " (active)" : ""} [${thread.status}]`,
      thread.pendingApprovalCount ? `approval:${thread.pendingApprovalCount}` : undefined,
      thread.blockingReasonKind,
      thread.narrativeSummary,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" "),
  );

  return lines.length > 0 ? lines.join("\n") : "No threads available.";
}

export function deriveBaseSessionStage(
  session: Pick<RuntimeSessionState, "status"> | undefined,
): Extract<SessionStage, "idle" | "awaiting_confirmation" | "blocked"> {
  if (session?.status === "waiting_approval") {
    return "awaiting_confirmation";
  }

  if (session?.status === "blocked") {
    return "blocked";
  }

  return "idle";
}

export function deriveRuntimeSession(snapshot: RuntimeSnapshot): RuntimeSessionState {
  const blockingReason =
    snapshot.blockingReason ??
    snapshot.tasks.find((task) => task.status === "blocked" && task.blockingReason)?.blockingReason;
  const status = snapshot.pendingApprovals.length > 0 ? "waiting_approval" : blockingReason ? "blocked" : "completed";
  const stage = status === "waiting_approval" ? "awaiting_confirmation" : status === "blocked" ? "blocked" : "idle";

  return {
    status,
    stage,
    threadId: snapshot.activeThreadId,
    summary: snapshot.answers.at(-1)?.content ?? blockingReason?.message ?? snapshot.narrativeSummary ?? "Awaiting answer",
    tasks: snapshot.tasks,
    approvals: snapshot.pendingApprovals,
    answers: snapshot.answers,
    messages: snapshot.messages ?? [],
    workers: snapshot.workers,
    workspaceRoot: snapshot.workspaceRoot,
    projectId: snapshot.projectId,
    blockingReason,
    recommendationReason: snapshot.recommendationReason,
    narrativeSummary: snapshot.narrativeSummary,
    threads: snapshot.threads,
  };
}
