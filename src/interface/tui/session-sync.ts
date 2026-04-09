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

function deriveAnswersFromRecoveryFacts(
  threadId: string,
  recoveryFacts: ProjectedSessionResult["recoveryFacts"],
): RuntimeSessionState["answers"] {
  const latestAnswer = recoveryFacts?.latestDurableAnswer;
  if (!latestAnswer) {
    return [];
  }

  return [
    {
      answerId: latestAnswer.answerId,
      threadId,
      content: latestAnswer.summary,
    },
  ];
}

function deriveMessagesFromRecoveryFacts(
  threadId: string,
  recoveryFacts: ProjectedSessionResult["recoveryFacts"],
): NonNullable<RuntimeSessionState["messages"]> {
  return (recoveryFacts?.conversationHistory ?? []).map((message) => ({
    messageId: message.messageId,
    threadId,
    role: message.role,
    content: message.content,
  }));
}

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
  const taskBlockingReason = update.tasks?.find((task) => task.status === "blocked" && task.blockingReason)?.blockingReason;
  const blockingReason = update.recoveryFacts?.blocking
    ? {
        kind: update.recoveryFacts.blocking.kind,
        message: update.recoveryFacts.blocking.message,
      }
    : update.status === "blocked" || update.status === "waiting_approval"
      ? taskBlockingReason
      : undefined;
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
  const answers = update.answers ?? deriveAnswersFromRecoveryFacts(update.threadId, update.recoveryFacts);
  const messages = update.messages ?? deriveMessagesFromRecoveryFacts(update.threadId, update.recoveryFacts);

  return {
    status,
    stage: status === "waiting_approval" ? "awaiting_confirmation" : status === "blocked" ? "blocked" : "idle",
    threadId: update.threadId,
    summary: update.summary ?? current?.summary ?? "Awaiting answer",
    tasks: update.tasks ?? [],
    approvals: update.approvals ?? [],
    answers,
    messages,
    workers: update.workers ?? [],
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

  const summary = result.summary?.trim();
  if (summary && summary !== "Awaiting answer") {
    return [
      {
        id: `assistant-summary-${result.threadId ?? "unknown"}`,
        role: "assistant",
        content: summary,
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

export function buildDisplayMessages(input: {
  session: RuntimeSessionState | undefined;
  pendingUserMessage?: TuiMessage;
  streamedAssistantMessage?: TuiMessage;
}): TuiMessage[] {
  const messages = input.session ? [...deriveMessagesFromSession(input.session)] : [];

  if (input.pendingUserMessage) {
    const alreadyPresent = messages.some(
      (message) => message.role === "user" && message.content === input.pendingUserMessage?.content,
    );
    if (!alreadyPresent) {
      messages.push(input.pendingUserMessage);
    }
  }

  if (input.streamedAssistantMessage) {
    messages.push(input.streamedAssistantMessage);
  }

  return messages;
}

export function findActiveThreadIndex(result: Pick<RuntimeSessionState, "threadId" | "threads">): number {
  const activeIndex = result.threads.findIndex((thread) => thread.threadId === result.threadId);
  return activeIndex >= 0 ? activeIndex : 0;
}
