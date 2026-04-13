import { parseCommand, type ApprovalCommand, type TuiParsedInput } from "./commands";
import { deriveBaseSessionStage, type RuntimeSessionState, type SessionStage } from "../runtime/runtime-session";
import { parseApprovalDecision } from "./app-state-support";
import type { TuiSessionResult } from "./hooks/use-kernel";
import type { TuiLaunchState } from "./view-state";

type InputSupportDeps = {
  launchState: TuiLaunchState;
  session: RuntimeSessionState | undefined;
  modelStatus: "idle" | "thinking" | "responding";
  activeTaskIntent: "plan" | "execute" | null;
  onMarkLiveSessionActivity: () => void;
  onApplyKernelResult: (result: TuiSessionResult, source?: "hydrate" | "command" | "event") => void;
  onSetLaunchState: (updater: (current: TuiLaunchState) => TuiLaunchState) => void;
  onResetConversationMessages: () => void;
  onAppendUserMessage: (content: string) => void;
  onSetActiveTaskIntent: (intent: "plan" | "execute" | null) => void;
  onUpdateSelectedSessionIndex: (index: number) => void;
  onOpenSettingsPane: () => Promise<void>;
  onHandleCommand: (command:
    | { type: "thread_new" }
    | { type: "approve_request"; payload: { approvalRequestId: string } }
    | { type: "reject_request"; payload: { approvalRequestId: string } }
    | { type: "plan_input"; payload: { text: string } }
    | { type: "submit_input"; payload: { text: string } }
  ) => Promise<TuiSessionResult>;
  resolveActiveThreadIndex: () => number;
};

export function resolveComposerMode(
  session: RuntimeSessionState | undefined,
): "input" | "confirm" | "blocked" {
  return session?.status === "waiting_approval"
    ? "confirm"
    : session?.status === "blocked"
      ? "blocked"
      : "input";
}

export function deriveInteractiveStage(input: {
  session: RuntimeSessionState | undefined;
  activeTaskIntent: "plan" | "execute" | null;
  modelStatus: "idle" | "thinking" | "responding";
}): SessionStage {
  const sessionStage = deriveBaseSessionStage(input.session);
  if (sessionStage !== "idle") {
    return sessionStage;
  }

  if (input.activeTaskIntent === "plan") {
    return "planning";
  }

  if (
    input.activeTaskIntent === "execute"
    || input.modelStatus === "thinking"
    || input.modelStatus === "responding"
  ) {
    return "executing";
  }

  return "idle";
}

// 输入支持层：
// 只负责把 composer 文本分发为审批、本地命令或普通提交，
// 并协调 launch / utility pane 的本地 UI 状态。
export async function ensureLaunchThreadForInput(deps: Pick<
  InputSupportDeps,
  "launchState" | "onMarkLiveSessionActivity" | "onHandleCommand" | "onSetLaunchState" | "onApplyKernelResult"
>) {
  if (deps.launchState.hasCreatedThreadThisLaunch) {
    return;
  }

  deps.onMarkLiveSessionActivity();
  const newThreadResult = await deps.onHandleCommand({ type: "thread_new" });
  deps.onSetLaunchState((current) => ({
    ...current,
    hasCreatedThreadThisLaunch: true,
    activeUtilityPane: "none",
  }));
  deps.onApplyKernelResult(newThreadResult, "command");
}

export async function submitApprovalInput(
  deps: Pick<InputSupportDeps, "session" | "onMarkLiveSessionActivity" | "onHandleCommand" | "onApplyKernelResult">,
  text: string,
) {
  const approvalRequestId = deps.session?.approvals[0]?.approvalRequestId;
  if (!approvalRequestId) {
    return;
  }

  const decision = parseApprovalDecision(text);
  if (!decision) {
    return;
  }

  const command: ApprovalCommand = decision === "approve"
    ? { type: "approve_request", payload: { approvalRequestId } }
    : { type: "reject_request", payload: { approvalRequestId } };

  deps.onMarkLiveSessionActivity();
  const result = await deps.onHandleCommand(command);
  deps.onApplyKernelResult(result, "command");
}

export async function handleLocalComposerCommand(
  deps: Pick<
    InputSupportDeps,
    | "session"
    | "onHandleCommand"
    | "onSetLaunchState"
    | "onApplyKernelResult"
    | "onResetConversationMessages"
    | "onUpdateSelectedSessionIndex"
    | "resolveActiveThreadIndex"
    | "onOpenSettingsPane"
  >,
  parsed: Extract<TuiParsedInput, { kind: "command" }>,
) {
  if (parsed.name === "new") {
    const result = await deps.onHandleCommand({ type: "thread_new" });
    deps.onSetLaunchState((current) => ({
      ...current,
      hasCreatedThreadThisLaunch: true,
      activeUtilityPane: "none",
    }));
    deps.onApplyKernelResult(result, "command");
    deps.onResetConversationMessages();
    return;
  }

  if (parsed.name === "sessions") {
    deps.onUpdateSelectedSessionIndex(0);
    deps.onSetLaunchState((current) => ({ ...current, activeUtilityPane: "sessions" }));
    deps.onUpdateSelectedSessionIndex(deps.resolveActiveThreadIndex());
    return;
  }

  if (parsed.name === "clear") {
    deps.onResetConversationMessages();
    deps.onSetLaunchState((current) => ({ ...current, activeUtilityPane: "none" }));
    return;
  }

  if (parsed.name === "history") {
    deps.onSetLaunchState((current) => ({ ...current, activeUtilityPane: "history" }));
    return;
  }

  if (parsed.name === "settings") {
    await deps.onOpenSettingsPane();
    return;
  }

  if (parsed.name === "help") {
    deps.onSetLaunchState((current) => ({ ...current, activeUtilityPane: "help" }));
  }
}

export async function submitParsedComposerInput(
  deps: Pick<
    InputSupportDeps,
    | "launchState"
    | "onMarkLiveSessionActivity"
    | "onAppendUserMessage"
    | "onSetActiveTaskIntent"
    | "onHandleCommand"
    | "onApplyKernelResult"
    | "onSetLaunchState"
  >,
  parsed: Exclude<TuiParsedInput, { kind: "command" }>,
  value: string,
) {
  deps.onMarkLiveSessionActivity();
  await ensureLaunchThreadForInput({
    launchState: deps.launchState,
    onMarkLiveSessionActivity: deps.onMarkLiveSessionActivity,
    onHandleCommand: deps.onHandleCommand,
    onSetLaunchState: deps.onSetLaunchState,
    onApplyKernelResult: deps.onApplyKernelResult,
  });

  deps.onAppendUserMessage(value);
  deps.onSetActiveTaskIntent(parsed.kind === "plan" ? "plan" : "execute");
  const result = await deps.onHandleCommand(
    parsed.kind === "plan"
      ? {
          type: "plan_input",
          payload: { text: parsed.text },
        }
      : {
          type: "submit_input",
          payload: { text: parsed.text },
        },
  );
  deps.onApplyKernelResult(result, "command");
}

export async function submitComposerInput(
  deps: InputSupportDeps,
  text: string,
) {
  const composerMode = resolveComposerMode(deps.session);
  if (composerMode === "blocked") {
    return;
  }

  if (composerMode === "confirm") {
    await submitApprovalInput(deps, text);
    return;
  }

  const value = text.trim();
  if (!value) {
    return;
  }

  const parsed = parseCommand(value);
  if (parsed.kind === "command") {
    await handleLocalComposerCommand(deps, parsed);
    return;
  }

  await submitParsedComposerInput(deps, parsed, value);
}
