import type { ProjectedSessionResult } from "../../harness/core/projection/session-view-projector";
import type { TuiKernelEvent, TuiSessionResult } from "./hooks/use-kernel";
import type { RuntimeSessionState } from "./runtime/runtime-session";

/** TUI 内部消息模型：把 runtime session truth 转成界面可渲染的对话条目 */
export type TuiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  thinkingDuration?: number;
  timestamp: number;
};

/** 会话更新来源：用于区分 hydrate、命令返回和事件流更新 */
export type SessionUpdateSource = "hydrate" | "command" | "event";

/** 从 recoveryFacts 恢复 durable answer 视图 */
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

/** 从 recoveryFacts 恢复消息历史 */
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

/** 把 kernel/runtime 的状态枚举折叠成 TUI 关心的 completed/waiting_approval/blocked */
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

/** 把 thread.view_updated 合并进当前 TUI session truth */
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
  // 线程列表始终以协议返回值为准，避免沿用过期的本地 UI 缓存。
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

/** 从会话 truth 派生界面消息；优先 transcript，其次 answer/summary/narrative */
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

/** 组装最终显示消息：在 durable transcript 基础上叠加本地 pending / streaming 覆盖层 */
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

/** 找到当前 active thread 在线程列表中的索引，供面板高亮使用 */
export function findActiveThreadIndex(result: Pick<RuntimeSessionState, "threadId" | "threads">): number {
  const activeIndex = result.threads.findIndex((thread) => thread.threadId === result.threadId);
  return activeIndex >= 0 ? activeIndex : 0;
}
