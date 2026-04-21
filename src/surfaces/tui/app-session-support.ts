import { deriveBaseSessionStage, type RuntimeSessionState } from "./runtime/runtime-session";
import type { TuiKernelEvent, TuiSessionResult } from "./hooks/use-kernel";
import {
  findActiveThreadIndex,
  mergeThreadModeChangeIntoSession,
  mergeThreadViewIntoSession,
  type SessionUpdateSource,
} from "./session-sync";
import type { ConversationDisplayState, ThinkingState } from "./app-state-support";

type SessionSyncDeps = {
  activeThreadId: string | undefined;
  modelStatus: ConversationDisplayState["modelStatus"];
  onMarkLiveSessionActivity: () => void;
  onRememberActiveThreadId: (threadId: string | undefined) => void;
  onRememberSession: (session: RuntimeSessionState) => void;
  onSetSession: (session: RuntimeSessionState) => void;
  onResetConversationForThreadChange: () => void;
  onResetTransientConversation: () => void;
  onUpdateSelectedSessionIndex: (index: number) => void;
  onUpdateThinking: (thinking: ThinkingState | null) => void;
  onClearActiveTaskIntent: () => void;
};

type KernelEventDeps = SessionSyncDeps & {
  session: RuntimeSessionState | undefined;
  onSetRuntimeStatus: (status: "connected" | "disconnected") => void;
  onSetModelStatus: (status: ConversationDisplayState["modelStatus"]) => void;
  onApplyStreamThinkingChunk: (chunkContent: string) => void;
  onApplyStreamTextChunk: (chunkContent: string) => void;
};

function mergeTaskFailureIntoSession(
  current: RuntimeSessionState | undefined,
  failure: Extract<TuiKernelEvent, { type: "task.failed" }>["payload"],
): RuntimeSessionState | undefined {
  const threadId = failure.threadId;
  if (!current || !threadId || current.threadId !== threadId) {
    return current;
  }

  const failedTask = current.tasks.find(
    (task) => task.threadId === threadId && task.status === "running",
  );
  const failureContent = `任务失败：${failure.error}`;
  const currentMessages = current.messages ?? [];
  const hasFailureMessage = currentMessages.some(
    (message) => message.role === "assistant" && message.content === failureContent,
  );
  const messages = hasFailureMessage
    ? currentMessages
    : [
        ...currentMessages,
        {
          messageId: `task_failed_${failedTask?.taskId ?? threadId}`,
          threadId,
          role: "assistant" as const,
          content: failureContent,
        },
      ];

  return {
    ...current,
    status: "completed",
    stage: "idle",
    tasks: current.tasks.map((task) =>
      task.threadId === threadId && task.status === "running"
        ? {
            ...task,
            status: "failed" as const,
            summary: task.summary || failureContent,
          }
        : task,
    ),
    messages,
    pauseSummary: failureContent,
  };
}

// 会话同步支持层：
// 只负责把 kernel/session event 翻译成 TUI 的会话状态变化，
// 不处理输入命令，也不拥有界面本身的布局逻辑。
export function syncSessionStateIntoApp(
  input: {
    result: RuntimeSessionState | TuiSessionResult;
    source: SessionUpdateSource;
  } & SessionSyncDeps,
) {
  if (input.source !== "hydrate") {
    input.onMarkLiveSessionActivity();
  }

  const previousThreadId = input.activeThreadId;
  const nextThreadId = input.result.threadId;
  const threadChanged = previousThreadId !== undefined && nextThreadId !== previousThreadId;

  input.onRememberActiveThreadId(nextThreadId);
  input.onRememberSession(input.result);
  input.onSetSession(input.result);

  if (threadChanged) {
    input.onResetConversationForThreadChange();
    input.onUpdateSelectedSessionIndex(findActiveThreadIndex(input.result));
    input.onUpdateThinking(null);
  }

  if (input.source === "event" || input.source === "hydrate") {
    input.onResetTransientConversation();
  }

  if (
    input.source !== "hydrate"
    && (deriveBaseSessionStage(input.result) !== "idle" || input.modelStatus === "idle")
  ) {
    input.onClearActiveTaskIntent();
  }

  return { threadChanged };
}

export function applyKernelEventToApp(event: TuiKernelEvent, deps: KernelEventDeps) {
  if (event.type === "model.status") {
    deps.onSetModelStatus(event.payload.status);
    if (event.payload.status === "idle" && deriveBaseSessionStage(deps.session) === "idle") {
      deps.onClearActiveTaskIntent();
    }
    return;
  }

  if (event.type === "runtime.status") {
    deps.onSetRuntimeStatus(event.payload.status);
    return;
  }

  if (event.type === "thread.interrupted") {
    deps.onMarkLiveSessionActivity();
    deps.onSetModelStatus("idle");
    deps.onClearActiveTaskIntent();
    return;
  }

  if (event.type === "task.failed") {
    const nextSession = mergeTaskFailureIntoSession(deps.session, event.payload);
    deps.onSetModelStatus("idle");
    deps.onUpdateThinking(null);
    deps.onClearActiveTaskIntent();
    if (nextSession) {
      syncSessionStateIntoApp({
        ...deps,
        result: nextSession,
        source: "event",
      });
    }
    return;
  }

  if (event.type === "session.updated") {
    syncSessionStateIntoApp({
      ...deps,
      result: event.payload,
      source: "hydrate",
    });
    return;
  }

  if (event.type === "thread.view_updated") {
    const nextSession = mergeThreadViewIntoSession(deps.session, event.payload);
    syncSessionStateIntoApp({
      ...deps,
      result: nextSession,
      source: "event",
    });
    deps.onUpdateThinking(null);
    deps.onClearActiveTaskIntent();
    return;
  }

  if (event.type === "thread.mode_changed") {
    const nextSession = mergeThreadModeChangeIntoSession(deps.session, event.payload);
    if (!nextSession) {
      return;
    }
    syncSessionStateIntoApp({
      ...deps,
      result: nextSession,
      source: "event",
    });
    return;
  }

  if (event.type === "stream.thinking_started") {
    deps.onMarkLiveSessionActivity();
    deps.onUpdateThinking({ content: "", startedAt: Date.now() });
    return;
  }

  if (event.type === "stream.thinking_chunk") {
    deps.onMarkLiveSessionActivity();
    deps.onApplyStreamThinkingChunk(event.payload.content);
    return;
  }

  if (event.type === "stream.text_chunk" && event.payload.content) {
    deps.onMarkLiveSessionActivity();
    deps.onApplyStreamTextChunk(event.payload.content);
  }
}
