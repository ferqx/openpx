import type { UtilityPaneSessionSnapshot } from "./components/utility-pane";
import type { RuntimeSessionState } from "./runtime/runtime-session";
import type { TuiMessage } from "./session-sync";

/** 思考态：记录 reasoning 文本及耗时起点 */
export type ThinkingState = {
  content: string;
  startedAt: number;
  duration?: number;
};

/** 性能指标：等待模型与生成回复耗时 */
export type PerformanceState = {
  waitMs: number;
  genMs: number;
};

/** 会话显示态：只属于 TUI 的瞬时显示层，不是 runtime durable truth */
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

/** 创建会话显示态初始值 */
export function createInitialConversationDisplayState(): ConversationDisplayState {
  return {
    modelStatus: "idle",
    thinking: null,
    performance: { waitMs: 0, genMs: 0 },
    metricsStart: {},
    streamScrollOffset: 0,
  };
}

/** 把审批输入文本解析成 approve / reject 决策 */
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

/** 从完整 session 派生 utility pane 所需的只读快照 */
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

/** 比较 utility pane 消息是否相同，避免无意义重渲染 */
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

/** 比较 utility pane answers 是否相同 */
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

/** 比较 utility pane 线程列表是否相同 */
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

/** 判断 utility pane 快照是否等价 */
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
