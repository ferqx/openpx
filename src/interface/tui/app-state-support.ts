import type { UtilityPaneSessionSnapshot } from "./components/utility-pane";
import type { RuntimeSessionState } from "../runtime/runtime-session";
import type { TuiMessage } from "./session-sync";

export type ThinkingState = {
  content: string;
  startedAt: number;
  duration?: number;
};

export type PerformanceState = {
  waitMs: number;
  genMs: number;
};

export type ConversationDisplayState = {
  modelStatus: "idle" | "thinking" | "responding";
  pendingUserMessage?: TuiMessage;
  streamedAssistantMessage?: TuiMessage;
  thinking: ThinkingState | null;
  performance: PerformanceState;
  metricsStart: {
    thinking?: number;
    responding?: number;
  };
  streamScrollOffset: number;
};

export function createInitialConversationDisplayState(): ConversationDisplayState {
  return {
    modelStatus: "idle",
    thinking: null,
    performance: { waitMs: 0, genMs: 0 },
    metricsStart: {},
    streamScrollOffset: 0,
  };
}

export function parseApprovalDecision(text: string): "approve" | "reject" | undefined {
  const normalized = text.trim().toLowerCase();
  if (["y", "yes", "ok", "可以"].includes(normalized)) {
    return "approve";
  }

  if (["n", "no", "不行"].includes(normalized)) {
    return "reject";
  }

  return undefined;
}

export function buildUtilitySessionSnapshot(
  session: RuntimeSessionState | undefined,
): UtilityPaneSessionSnapshot | undefined {
  if (!session) {
    return undefined;
  }

  return {
    threadId: session.threadId,
    messages: session.messages,
    answers: session.answers,
    workspaceRoot: session.workspaceRoot,
    narrativeSummary: session.narrativeSummary,
    threads: session.threads,
  };
}

function areUtilityMessagesEqual(
  previous: UtilityPaneSessionSnapshot["messages"],
  next: UtilityPaneSessionSnapshot["messages"],
): boolean {
  if (previous === next) {
    return true;
  }

  if (!previous || !next) {
    return false;
  }

  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((message, index) => {
    const candidate = next[index];
    return (
      message.messageId === candidate?.messageId
      && message.role === candidate?.role
      && message.content === candidate?.content
    );
  });
}

function areUtilityAnswersEqual(
  previous: UtilityPaneSessionSnapshot["answers"],
  next: UtilityPaneSessionSnapshot["answers"],
): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((answer, index) => {
    const candidate = next[index];
    return (
      answer.answerId === candidate?.answerId
      && answer.threadId === candidate?.threadId
      && answer.content === candidate?.content
    );
  });
}

function areUtilityThreadsEqual(
  previous: UtilityPaneSessionSnapshot["threads"],
  next: UtilityPaneSessionSnapshot["threads"],
): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((thread, index) => {
    const candidate = next[index];
    return (
      thread.threadId === candidate?.threadId
      && thread.workspaceRoot === candidate?.workspaceRoot
      && thread.projectId === candidate?.projectId
      && thread.revision === candidate?.revision
      && thread.status === candidate?.status
      && thread.narrativeSummary === candidate?.narrativeSummary
      && thread.narrativeRevision === candidate?.narrativeRevision
      && thread.pendingApprovalCount === candidate?.pendingApprovalCount
      && thread.blockingReasonKind === candidate?.blockingReasonKind
    );
  });
}

export function isSameUtilitySessionSnapshot(
  previous: UtilityPaneSessionSnapshot | undefined,
  next: UtilityPaneSessionSnapshot | undefined,
): boolean {
  if (previous === next) {
    return true;
  }

  if (!previous || !next) {
    return false;
  }

  return (
    previous.threadId === next.threadId
    && previous.workspaceRoot === next.workspaceRoot
    && previous.narrativeSummary === next.narrativeSummary
    && areUtilityMessagesEqual(previous.messages, next.messages)
    && areUtilityAnswersEqual(previous.answers, next.answers)
    && areUtilityThreadsEqual(previous.threads, next.threads)
  );
}
