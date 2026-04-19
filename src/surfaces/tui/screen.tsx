import React from "react";
import { Box, Text, useStdout } from "ink";
import { InteractionStream } from "./components/interaction-stream";
import { Composer } from "./components/composer";
import { StatusBar } from "./components/status-bar";
import { ThreadPanel, type ThreadSummary } from "./components/thread-panel";
import { WelcomePane } from "./components/welcome-pane";
import { UtilityPane, type UtilityPaneSessionSnapshot } from "./components/utility-pane";
import { SettingsPane } from "./components/settings-pane";
import { theme } from "./theme";
import { computeScreenLayout } from "./screen-layout";
import type { TaskSummary } from "./components/task-panel";
import type { ApprovalSummary } from "./components/approval-panel";
import type { WorkerSummary } from "./components/worker-panel";
import type { UtilityPaneMode } from "./view-state";
import type { SessionStage } from "./runtime/runtime-session";
import type { ResolvedSettingsConfig } from "./settings/config-resolver";
import type { PartialSettingsConfig, SettingsConfigScope } from "./settings/config-types";

/** Screen 会话区消息模型 */
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

/** Screen 会话区视图 */
export type ScreenConversationView = {
  messages: Message[];
  tasks: TaskSummary[];
  approvals: ApprovalSummary[];
  workers: WorkerSummary[];
  modelStatus?: string;
  performance?: { waitMs: number; genMs: number };
  narrativeSummary?: string;
  showWelcome?: boolean;
  streamScrollOffset?: number;
};

/** Screen utility 区视图 */
export type ScreenUtilityView = {
  activeUtilityPane?: UtilityPaneMode;
  utilitySession?: UtilityPaneSessionSnapshot;
  settingsConfig?: ResolvedSettingsConfig;
  selectedSessionThreadId?: string;
};

/** Screen 顶部 chrome 视图 */
export type ScreenChromeView = {
  workspaceRoot?: string;
  projectId?: string;
  threadId?: string;
  runtimeStatus?: string;
  stage?: SessionStage;
  modelName?: string;
  thinkingLevel?: string;
  recommendationReason?: string;
  blockingReason?: {
    kind: "waiting_approval" | "human_recovery";
    message: string;
  };
  threads?: ThreadSummary[];
  showThreadPanel?: boolean;
  exitConfirmText?: string;
};

/** Screen composer 区视图 */
export type ScreenComposerView = {
  composerMode?: "input" | "confirm" | "blocked";
  onSubmit?: (text: string) => Promise<void> | void;
  onCommandMenuOpenChange?: (isOpen: boolean) => void;
  onComposerEscape?: () => Promise<void> | void;
  onSettingsSave?: (scope: SettingsConfigScope, config: PartialSettingsConfig) => Promise<void> | void;
  onSettingsClose?: () => void;
};

type ScreenUtilityRegionProps = {
  activeUtilityPane?: UtilityPaneMode;
  overlayRows: number;
  settingsConfig?: ResolvedSettingsConfig;
  modelName?: string;
  thinkingLevel?: string;
  workspaceRoot?: string;
  threadId?: string;
  stage?: SessionStage;
  onSettingsSave?: (scope: SettingsConfigScope, config: PartialSettingsConfig) => Promise<void> | void;
  onSettingsClose?: () => void;
  utilitySession?: UtilityPaneSessionSnapshot;
  selectedSessionThreadId?: string;
};

const ScreenThreadRegion = React.memo(function ScreenThreadRegion(input: {
  showThreadPanel?: boolean;
  threads?: ThreadSummary[];
  activeThreadId?: string;
}) {
  if (!input.showThreadPanel) {
    return null;
  }

  return (
    <Box key="thread-panel" marginBottom={1}>
      <ThreadPanel threads={input.threads ?? []} activeThreadId={input.activeThreadId} />
    </Box>
  );
});

const ScreenUtilityRegion = React.memo(
  function ScreenUtilityRegion(input: ScreenUtilityRegionProps) {
    if (input.activeUtilityPane === "settings" && input.settingsConfig) {
      return (
        <Box height={input.overlayRows} overflow="hidden" flexDirection="column">
          <SettingsPane
            modelName={input.modelName}
            thinkingLevel={input.thinkingLevel}
            workspaceRoot={input.workspaceRoot}
            threadId={input.threadId}
            stage={input.stage}
            config={input.settingsConfig}
            onSave={(scope, config) => input.onSettingsSave?.(scope, config)}
            onClose={() => input.onSettingsClose?.()}
          />
        </Box>
      );
    }

    if (input.activeUtilityPane && input.activeUtilityPane !== "none" && input.activeUtilityPane !== "settings") {
      return (
        <Box height={input.overlayRows} overflow="hidden" flexDirection="column">
          <UtilityPane
            mode={input.activeUtilityPane}
            session={input.utilitySession}
            modelName={input.modelName}
            thinkingLevel={input.thinkingLevel}
            selectedThreadId={input.selectedSessionThreadId}
          />
        </Box>
      );
    }

    return null;
  },
  (prev, next) => {
    if (prev.activeUtilityPane !== next.activeUtilityPane) {
      return false;
    }

    if (prev.overlayRows !== next.overlayRows) {
      return false;
    }

    if (next.activeUtilityPane === "settings") {
      return (
        prev.settingsConfig === next.settingsConfig &&
        prev.modelName === next.modelName &&
        prev.thinkingLevel === next.thinkingLevel &&
        prev.workspaceRoot === next.workspaceRoot &&
        prev.threadId === next.threadId &&
        prev.stage === next.stage
      );
    }

    if (next.activeUtilityPane && next.activeUtilityPane !== "none") {
      return (
        prev.utilitySession === next.utilitySession &&
        prev.modelName === next.modelName &&
        prev.thinkingLevel === next.thinkingLevel &&
        prev.selectedSessionThreadId === next.selectedSessionThreadId
      );
    }

    return true;
  },
);

const ScreenFooterRegion = React.memo(function ScreenFooterRegion(input: {
  activeUtilityPane?: UtilityPaneMode;
  composerMode?: "input" | "confirm" | "blocked";
  onSubmit?: (text: string) => Promise<void> | void;
  onCommandMenuOpenChange?: (isOpen: boolean) => void;
  onComposerEscape?: () => Promise<void> | void;
  modelName?: string;
  thinkingLevel?: string;
  workspaceRoot?: string;
  stage?: SessionStage;
  exitConfirmText?: string;
}) {
  return (
    <>
      {input.activeUtilityPane !== "settings" ? (
        <Box key="composer" borderStyle="single" borderTop={true} borderBottom={true} borderLeft={false} borderRight={false} borderColor="gray">
          <Composer
            mode={input.composerMode}
            onSubmit={input.onSubmit}
            onCommandMenuOpenChange={input.onCommandMenuOpenChange}
            onEscape={input.onComposerEscape}
            isActive={input.activeUtilityPane !== "sessions"}
          />
        </Box>
      ) : null}

      <StatusBar
        key="statusbar"
        modelName={input.modelName}
        thinkingLevel={input.thinkingLevel}
        workspaceRoot={input.workspaceRoot ?? ""}
        stage={input.stage}
        exitConfirmText={input.exitConfirmText}
      />
    </>
  );
});

export function Screen(input: {
  conversationView: ScreenConversationView;
  utilityView: ScreenUtilityView;
  chromeView: ScreenChromeView;
  composerView: ScreenComposerView;
}) {
  const { stdout } = useStdout();
  const terminalRows = stdout?.rows ?? 24;
  const layout = computeScreenLayout({
    terminalRows,
    showThreadPanel: input.chromeView.showThreadPanel,
    activeUtilityPane: input.utilityView.activeUtilityPane,
    composerMode: input.composerView.composerMode,
    recommendationReason: input.chromeView.recommendationReason,
    blockingReason: input.chromeView.blockingReason,
    stage: input.chromeView.stage,
    showWelcome: input.conversationView.showWelcome,
  });

  return (
    <Box flexDirection="column">
      <ScreenThreadRegion
        showThreadPanel={input.chromeView.showThreadPanel}
        threads={input.chromeView.threads}
        activeThreadId={input.chromeView.threadId}
      />

      <Box
        key="stream"
        flexDirection="column"
        justifyContent={input.conversationView.showWelcome ? "flex-start" : "flex-end"}
      >
        {input.conversationView.showWelcome ? (
          <Box flexGrow={1} justifyContent="flex-start">
            <WelcomePane
              workspaceRoot={input.chromeView.workspaceRoot}
              projectId={input.chromeView.projectId}
              viewportWidth={stdout?.columns ?? 80}
            />
          </Box>
        ) : (
            <InteractionStream 
              messages={input.conversationView.messages}
              tasks={input.conversationView.tasks}
              approvals={input.conversationView.approvals}
              workers={input.conversationView.workers}
              modelStatus={input.conversationView.modelStatus}
              performance={input.conversationView.performance}
              narrativeSummary={input.conversationView.narrativeSummary}
              viewportWidth={stdout?.columns ?? 80}
              scrollOffset={input.conversationView.streamScrollOffset}
            />
        )}
      </Box>

      <ScreenUtilityRegion
        activeUtilityPane={input.utilityView.activeUtilityPane}
        overlayRows={layout.overlayRows}
        settingsConfig={input.utilityView.settingsConfig}
        modelName={input.chromeView.modelName}
        thinkingLevel={input.chromeView.thinkingLevel}
        workspaceRoot={input.chromeView.workspaceRoot}
        threadId={input.chromeView.threadId}
        stage={input.chromeView.stage}
        onSettingsSave={input.composerView.onSettingsSave}
        onSettingsClose={input.composerView.onSettingsClose}
        utilitySession={input.utilityView.utilitySession}
        selectedSessionThreadId={input.utilityView.selectedSessionThreadId}
      />

      {/* Recommendation Prompt */}
      {input.composerView.composerMode === "confirm" && input.chromeView.recommendationReason && (
        <Box key="recommendation" paddingX={1} marginBottom={1} borderStyle="round" borderColor="yellow">
          <Text color="yellow">{theme.symbols.warning} {input.chromeView.recommendationReason}</Text>
        </Box>
      )}

      {input.composerView.composerMode === "blocked" && (
        <Box key="blocked" paddingX={1} marginBottom={1} borderStyle="round" borderColor="yellow" flexDirection="column">
          <Text color="yellow">{theme.symbols.warning} Session blocked: manual recovery required.</Text>
          {input.chromeView.blockingReason?.message ? <Text>{input.chromeView.blockingReason.message}</Text> : null}
          <Text color={theme.colors.dim}>Inspect the workspace state before continuing.</Text>
        </Box>
      )}

      <ScreenFooterRegion
        activeUtilityPane={input.utilityView.activeUtilityPane}
        composerMode={input.composerView.composerMode}
        onSubmit={input.composerView.onSubmit}
        onCommandMenuOpenChange={input.composerView.onCommandMenuOpenChange}
        onComposerEscape={input.composerView.onComposerEscape}
        modelName={input.chromeView.modelName}
        thinkingLevel={input.chromeView.thinkingLevel}
        workspaceRoot={input.chromeView.workspaceRoot}
        stage={input.chromeView.stage}
        exitConfirmText={input.chromeView.exitConfirmText}
      />
    </Box>
  );
}
