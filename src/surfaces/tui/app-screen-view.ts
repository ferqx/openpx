import type { ScreenChromeView, ScreenComposerView, ScreenConversationView, ScreenUtilityView } from "./screen";
import type { RuntimeSessionState, SessionStage } from "./runtime/runtime-session";
import type { ResolvedSettingsConfig } from "./settings/config-resolver";
import type { PartialSettingsConfig, SettingsConfigScope } from "./settings/config-types";
import type { UtilityPaneSessionSnapshot } from "./components/utility-pane";
import type { TaskSummary } from "./components/task-panel";
import type { ApprovalSummary } from "./components/approval-panel";
import type { WorkerSummary } from "./components/worker-panel";
import type { ConversationDisplayState } from "./app-state-support";

/** 组装会话区视图：把 runtime truth 与本地 conversation 显示态拼成渲染模型 */
export function buildConversationView(input: {
  conversationState: Pick<
    ConversationDisplayState,
    "modelStatus" | "performance" | "streamScrollOffset"
  > & {
    messages: ScreenConversationView["messages"];
  };
  session?: RuntimeSessionState;
  hasCreatedThreadThisLaunch: boolean;
}): ScreenConversationView {
  return {
    messages: input.conversationState.messages,
    tasks: (input.session?.tasks ?? []) as TaskSummary[],
    approvals: (input.session?.approvals ?? []) as ApprovalSummary[],
    workers: (input.session?.workers ?? []) as WorkerSummary[],
    modelStatus: input.conversationState.modelStatus,
    performance: input.conversationState.performance,
    narrativeSummary: input.session?.narrativeSummary,
    planDecision: input.session?.planDecision,
    showWelcome: !input.hasCreatedThreadThisLaunch && !input.session?.planDecision,
    streamScrollOffset: input.conversationState.streamScrollOffset,
  };
}

/** 组装 utility pane 视图 */
export function buildUtilityView(input: {
  activeUtilityPane: ScreenUtilityView["activeUtilityPane"];
  utilitySession?: UtilityPaneSessionSnapshot;
  settingsConfig?: ResolvedSettingsConfig;
  selectedSessionIndex: number;
}): ScreenUtilityView {
  return {
    activeUtilityPane: input.activeUtilityPane,
    utilitySession: input.utilitySession,
    settingsConfig: input.settingsConfig,
    selectedSessionThreadId: input.utilitySession?.threads?.[input.selectedSessionIndex]?.threadId,
  };
}

/** 组装 chrome 视图：顶部状态、线程面板与阻塞提示都从这里喂给 Screen */
export function buildChromeView(input: {
  session?: RuntimeSessionState;
  runtimeStatus: "connected" | "disconnected";
  stage: SessionStage;
  showThreadPanel: boolean;
  modelName: string;
  thinkingLevel: string;
  exitConfirmText?: string;
}): ScreenChromeView {
  return {
    workspaceRoot: input.session?.workspaceRoot,
    projectId: input.session?.projectId,
    primaryAgent: input.session?.primaryAgent,
    threadMode: input.session?.threadMode,
    threadId: input.session?.threadId,
    runtimeStatus: input.runtimeStatus,
    stage: input.stage,
    modelName: input.modelName,
    thinkingLevel: input.thinkingLevel,
    recommendationReason: input.session?.recommendationReason,
    blockingReason: input.session?.blockingReason,
    threads: input.session?.threads,
    showThreadPanel: input.showThreadPanel,
    exitConfirmText: input.exitConfirmText,
  };
}

/** 组装 composer 视图：只暴露 Screen 需要的交互句柄 */
export function buildComposerView(input: {
  composerMode: "input" | "confirm" | "blocked";
  submit: (text: string) => Promise<void> | void;
  onCommandMenuOpenChange: (isOpen: boolean) => void;
  onComposerEscape: () => Promise<void> | void;
  onSettingsSave: (scope: SettingsConfigScope, config: PartialSettingsConfig) => Promise<void> | void;
  onSettingsClose: () => void;
}): ScreenComposerView {
  return {
    composerMode: input.composerMode,
    onSubmit: input.submit,
    onCommandMenuOpenChange: input.onCommandMenuOpenChange,
    onComposerEscape: input.onComposerEscape,
    onSettingsSave: input.onSettingsSave,
    onSettingsClose: input.onSettingsClose,
  };
}
