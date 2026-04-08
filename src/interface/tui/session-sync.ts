import type { ProjectedSessionResult } from "../../kernel/session-view-projector";
import type { TuiKernelEvent, TuiSessionResult } from "./hooks/use-kernel";
import type { RuntimeSessionState } from "../runtime/runtime-session";

export type TuiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  thinkingDuration?: number;
  timestamp: number;
};

export type SessionUpdateSource = "hydrate" | "command" | "event";

function toRuntimeSessionStatus(
  status: ProjectedSessionResult["status"] | RuntimeSessionState["status"] | RuntimeSessionState["threads"][number]["status"] | undefined,
): RuntimeSessionState["status"] {
  if (status === "waiting_approval") {
    return "waiting_approval";
  }

  if (status === "blocked") {
    return "blocked";
  }

  return "completed";
}

export function mergeThreadViewIntoSession(
  current: RuntimeSessionState | undefined,
  update: Extract<TuiKernelEvent, { type: "thread.view_updated" }>["payload"],
): RuntimeSessionState {
  const status = toRuntimeSessionStatus(update.status);
  const workspaceRoot = update.workspaceRoot ?? current?.workspaceRoot ?? process.cwd();
  const projectId = update.projectId ?? current?.projectId ?? "unknown";
  const blockingReason = update.recoveryFacts?.blocking
    ? {
        kind: update.recoveryFacts.blocking.kind,
        message: update.recoveryFacts.blocking.message,
      }
    : current?.blockingReason;
  const threads = update.threads
    ? update.threads.map((thread, index) => {
        const existing = current?.threads.find((candidate) => candidate.threadId === thread.threadId);
        return {
          threadId: thread.threadId,
          workspaceRoot: existing?.workspaceRoot ?? workspaceRoot,
          projectId: existing?.projectId ?? projectId,
          revision: existing?.revision ?? index + 1,
          status: thread.status as RuntimeSessionState["threads"][number]["status"],
          activeRunId: thread.activeRunId,
          activeRunStatus: thread.activeRunStatus,
          narrativeSummary: thread.narrativeSummary,
          pendingApprovalCount: thread.pendingApprovalCount,
          blockingReasonKind: thread.blockingReasonKind,
        };
      })
    : current?.threads ?? [];

  return {
    status,
    stage: status === "waiting_approval" ? "awaiting_confirmation" : status === "blocked" ? "blocked" : "idle",
    threadId: update.threadId,
    summary: update.summary ?? current?.summary ?? "Awaiting answer",
    tasks: update.tasks ?? current?.tasks ?? [],
    approvals: update.approvals ?? current?.approvals ?? [],
    answers: current?.answers ?? [],
    messages: current?.messages ?? [],
    workers: current?.workers ?? [],
    workspaceRoot,
    projectId,
    blockingReason,
    recommendationReason: update.recommendationReason ?? current?.recommendationReason,
    narrativeSummary: update.narrativeState?.threadSummary ?? current?.narrativeSummary,
    threads,
  };
}

export function deriveMessagesFromSession(result: RuntimeSessionState | TuiSessionResult): TuiMessage[] {
  const transcript = (result.messages ?? [])
    .filter((message) => message.content.trim().length > 0)
    .map((message, index) => ({
      id: message.messageId || `${message.role}-${index}`,
      role: message.role,
      content: message.content,
      timestamp: index,
    }));
  if (transcript.length > 0) {
    return transcript;
  }

  const latestAnswer = result.answers.at(-1)?.content?.trim();
  if (latestAnswer) {
    return [
      {
        id: `assistant-session-${result.threadId ?? "unknown"}`,
        role: "assistant",
        content: latestAnswer,
        timestamp: Date.now(),
      },
    ];
  }

  const narrativeSummary = result.narrativeSummary?.trim();
  if (narrativeSummary && narrativeSummary !== "Awaiting answer") {
    return [
      {
        id: `assistant-narrative-${result.threadId ?? "unknown"}`,
        role: "assistant",
        content: narrativeSummary,
        timestamp: Date.now(),
      },
    ];
  }

  return [];
}

export function findActiveThreadIndex(result: Pick<RuntimeSessionState, "threadId" | "threads">): number {
  const activeIndex = result.threads.findIndex((thread) => thread.threadId === result.threadId);
  return activeIndex >= 0 ? activeIndex : 0;
}
