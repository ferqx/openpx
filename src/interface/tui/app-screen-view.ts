import type { ScreenChromeView, ScreenComposerView, ScreenConversationView, ScreenUtilityView } from "./screen";
import type { RuntimeSessionState, SessionStage } from "../runtime/runtime-session";
import type { ResolvedSettingsConfig } from "./settings/config-resolver";
import type { SettingsConfig, SettingsConfigScope } from "./settings/config-types";
import type { UtilityPaneSessionSnapshot } from "./components/utility-pane";
import type { TaskSummary } from "./components/task-panel";
import type { ApprovalSummary } from "./components/approval-panel";
import type { WorkerSummary } from "./components/worker-panel";

type ConversationDisplayState = {
  modelStatus: "idle" | "thinking" | "responding";
  messages: ScreenConversationView["messages"];
  performance: { waitMs: number; genMs: number };
  streamScrollOffset: number;
};

export function buildConversationView(input: {
  conversationState: ConversationDisplayState;
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
    showWelcome: !input.hasCreatedThreadThisLaunch,
    streamScrollOffset: input.conversationState.streamScrollOffset,
  };
}

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

export function buildComposerView(input: {
  composerMode: "input" | "confirm" | "blocked";
  submit: (text: string) => Promise<void> | void;
  onCommandMenuOpenChange: (isOpen: boolean) => void;
  onComposerEscape: () => Promise<void> | void;
  onSettingsSave: (scope: SettingsConfigScope, config: SettingsConfig) => Promise<void> | void;
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
