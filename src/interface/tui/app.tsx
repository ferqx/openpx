import React, { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useInput } from "ink";
import { Screen, type ScreenChromeView, type ScreenComposerView, type ScreenConversationView, type ScreenUtilityView } from "./screen";
import type { TuiKernel, TuiKernelEvent, TuiSessionResult } from "./hooks/use-kernel";
import { type RuntimeSessionState, type SessionStage } from "../runtime/runtime-session";
import { createInitialLaunchState } from "./view-state";
import { createSettingsConfigStore, type SettingsConfigStore } from "./settings/config-store";
import type { ResolvedSettingsConfig } from "./settings/config-resolver";
import type { SettingsConfig, SettingsConfigScope } from "./settings/config-types";
import type { UtilityPaneSessionSnapshot } from "./components/utility-pane";
import { isThreadPanelToggle, resolveSessionsPaneAction, resolveStreamScrollDelta } from "./input-navigation";
import {
  buildChromeView,
  buildComposerView,
  buildConversationView,
  buildUtilityView,
} from "./app-screen-view";
import {
  applyKernelEventToApp,
  syncSessionStateIntoApp,
} from "./app-session-support";
import {
  deriveInteractiveStage,
  resolveComposerMode,
  submitComposerInput,
} from "./app-input-support";
import {
  buildDisplayMessages,
  findActiveThreadIndex,
  type SessionUpdateSource,
  type TuiMessage,
} from "./session-sync";
import {
  buildUtilitySessionSnapshot,
  createInitialConversationDisplayState,
  isSameUtilitySessionSnapshot,
  parseApprovalDecision,
  type ConversationDisplayState,
  type ThinkingState,
} from "./app-state-support";

type Message = TuiMessage;

export function App(input: { kernel: TuiKernel; settingsStore?: SettingsConfigStore }) {
  const [session, setSession] = useState<RuntimeSessionState | undefined>();
  const [runtimeStatus, setRuntimeStatus] = useState<"connected" | "disconnected">("disconnected");
  const [showThreadPanel, setShowThreadPanel] = useState(false);
  const [conversationState, setConversationState] = useState(createInitialConversationDisplayState);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0);
  const selectedSessionIndexRef = useRef(0);
  const sessionRef = useRef<RuntimeSessionState | undefined>(undefined);
  const [launchState, setLaunchState] = useState(createInitialLaunchState);
  const messageIdRef = useRef(0);
  const [activeTaskIntent, setActiveTaskIntent] = useState<"plan" | "execute" | null>(null);
  const [settingsConfig, setSettingsConfig] = useState<ResolvedSettingsConfig | undefined>();
  const [isExitConfirming, setIsExitConfirming] = useState(false);
  const exitConfirmingRef = useRef(false);
  const exitConfirmTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const activeThreadIdRef = useRef<string | undefined>(undefined);
  const utilitySessionSnapshotRef = useRef<UtilityPaneSessionSnapshot | undefined>(undefined);
  const conversationStateRef = useRef<ConversationDisplayState>(createInitialConversationDisplayState());
  const hasLiveSessionActivityRef = useRef(false);

  function updateSelectedSessionIndex(next: number) {
    selectedSessionIndexRef.current = next;
    setSelectedSessionIndex(next);
  }

  const updateConversationState = useEffectEvent((
    updater: (current: ConversationDisplayState) => ConversationDisplayState,
  ) => {
    setConversationState((current) => {
      const next = updater(current);
      conversationStateRef.current = next;
      return next;
    });
  });

  const handleSessionThreadSwitch = useEffectEvent(async (threadId: string) => {
    hasLiveSessionActivityRef.current = true;
    const result = await input.kernel.handleCommand({
      type: "thread_switch",
      payload: { threadId },
    });
    setLaunchState((current) => ({
      ...current,
      activeUtilityPane: "none",
      hasCreatedThreadThisLaunch: true,
    }));
    applyKernelResult(result, "command");
  });

  const handleInputNavigation = useEffectEvent((keyValue: string, key: {
    downArrow: boolean;
    upArrow: boolean;
    home: boolean;
    end: boolean;
    return: boolean;
    pageUp: boolean;
    pageDown: boolean;
    ctrl: boolean;
  }) => {
    if (keyValue === "\x1b[Ma" || keyValue === "\x1b[Ma") {
      updateConversationState((current) => ({
        ...current,
        streamScrollOffset: Math.max(0, current.streamScrollOffset + 1),
      }));
      return;
    }
    if (keyValue === "\x1b[Mb" || keyValue === "\x1b[Mb") {
      updateConversationState((current) => ({
        ...current,
        streamScrollOffset: Math.max(0, current.streamScrollOffset - 1),
      }));
      return;
    }
    if (launchState.activeUtilityPane === "sessions") {
      const sessionsAction = resolveSessionsPaneAction({
        keyValue,
        key,
        selectedIndex: selectedSessionIndexRef.current,
        threads: sessionRef.current?.threads ?? [],
      });

      if (sessionsAction.kind === "select") {
        updateSelectedSessionIndex(sessionsAction.index);
        return;
      }

      if (sessionsAction.kind === "switch") {
        void handleSessionThreadSwitch(sessionsAction.threadId);
        return;
      }
    }

    if (isThreadPanelToggle({ keyValue, key })) {
      setShowThreadPanel(prev => !prev);
      return;
    }

    const scrollDelta = resolveStreamScrollDelta(key);
    if (scrollDelta > 0) {
      updateConversationState((current) => ({
        ...current,
        streamScrollOffset: current.streamScrollOffset + scrollDelta,
      }));
      return;
    }

    if (scrollDelta < 0) {
      updateConversationState((current) => ({
        ...current,
        streamScrollOffset: Math.max(0, current.streamScrollOffset + scrollDelta),
      }));
    }
  });

  const clearExitConfirmation = useEffectEvent(() => {
    if (exitConfirmTimeoutRef.current) {
      clearTimeout(exitConfirmTimeoutRef.current);
      exitConfirmTimeoutRef.current = undefined;
    }
    exitConfirmingRef.current = false;
    setIsExitConfirming(false);
  });

  const armExitConfirmation = useEffectEvent(() => {
    if (exitConfirmTimeoutRef.current) {
      clearTimeout(exitConfirmTimeoutRef.current);
    }
    exitConfirmingRef.current = true;
    setIsExitConfirming(true);
    exitConfirmTimeoutRef.current = setTimeout(() => {
      exitConfirmTimeoutRef.current = undefined;
      exitConfirmingRef.current = false;
      setIsExitConfirming(false);
    }, 3000);
  });

  useInput((keyValue, key) => {
    // 检测 Ctrl+C
    if (key.ctrl && keyValue === "c") {
      if (exitConfirmingRef.current) {
        // 第二次按下，真正退出
        clearExitConfirmation();
        process.exit(0);
      } else {
        // 第一次按下，显示提示
        armExitConfirmation();
        return;
      }
    }
    handleInputNavigation(keyValue, key);
  });

  const resolveSettingsStore = useCallback((): SettingsConfigStore => {
    return (
      input.settingsStore ??
      createSettingsConfigStore({
        homeDir: process.env.HOME ?? process.cwd(),
        workspaceRoot: session?.workspaceRoot ?? process.cwd(),
      })
    );
  }, [input.settingsStore, session?.workspaceRoot]);

  const openSettingsPane = useCallback(async () => {
    const resolved = await resolveSettingsStore().readResolved();
    setSettingsConfig(resolved);
    setLaunchState((current) => ({ ...current, activeUtilityPane: "settings" }));
  }, [resolveSettingsStore]);

  const saveSettings = useCallback(async (scope: SettingsConfigScope, config: SettingsConfig) => {
    const store = resolveSettingsStore();
    if (scope === "global") {
      await store.writeGlobal(config);
    } else {
      await store.writeProject(config);
    }

    const resolved = await store.readResolved();
    setSettingsConfig(resolved);
  }, [resolveSettingsStore]);

  const updateThinking = useEffectEvent((next: ThinkingState | null) => {
    updateConversationState((current) => ({
      ...current,
      thinking: next,
    }));
  });

  const resetConversationForThreadChange = useEffectEvent(() => {
    updateConversationState((current) => ({
      ...current,
      pendingUserMessage: undefined,
      streamedAssistantMessage: undefined,
      streamScrollOffset: 0,
    }));
  });

  const resetTransientConversation = useEffectEvent(() => {
    updateConversationState((current) => ({
      ...current,
      pendingUserMessage: undefined,
      streamedAssistantMessage: undefined,
    }));
  });

  const clearActiveTaskIntent = useEffectEvent(() => {
    setActiveTaskIntent(null);
  });

  const setConversationModelStatus = useEffectEvent((status: ConversationDisplayState["modelStatus"]) => {
    updateConversationState((current) => ({
      ...current,
      modelStatus: status,
    }));
  });

  const applyStreamThinkingChunk = useEffectEvent((chunkContent: string) => {
    updateThinking(
      conversationStateRef.current.thinking
        ? {
            ...conversationStateRef.current.thinking,
            content: conversationStateRef.current.thinking.content + chunkContent,
          }
        : { content: chunkContent, startedAt: Date.now() },
    );
  });

  const applyStreamTextChunk = useEffectEvent((chunkContent: string) => {
    updateConversationState((current) => {
      const currentThinking = current.thinking;
      const streamedAssistantMessage = current.streamedAssistantMessage
        ? {
            ...current.streamedAssistantMessage,
            content: current.streamedAssistantMessage.content + chunkContent,
            thinking: current.streamedAssistantMessage.thinking ?? currentThinking?.content,
            thinkingDuration:
              current.streamedAssistantMessage.thinkingDuration ??
              (currentThinking ? Date.now() - currentThinking.startedAt : undefined),
          }
        : {
            id: nextMessageId("assistant"),
            role: "assistant" as const,
            content: chunkContent,
            thinking: currentThinking?.content,
            thinkingDuration: currentThinking ? Date.now() - currentThinking.startedAt : undefined,
            timestamp: Date.now(),
          };

      return {
        ...current,
        streamedAssistantMessage,
        streamScrollOffset: 0,
      };
    });
  });

  const syncSessionState = useEffectEvent((
    result: RuntimeSessionState | TuiSessionResult,
    source: SessionUpdateSource,
  ) => {
    return syncSessionStateIntoApp({
      result,
      source,
      activeThreadId: activeThreadIdRef.current,
      modelStatus: conversationStateRef.current.modelStatus,
      onMarkLiveSessionActivity: () => {
        hasLiveSessionActivityRef.current = true;
      },
      onRememberActiveThreadId: (threadId) => {
        activeThreadIdRef.current = threadId;
      },
      onRememberSession: (nextSession) => {
        sessionRef.current = nextSession;
      },
      onSetSession: setSession,
      onResetConversationForThreadChange: resetConversationForThreadChange,
      onResetTransientConversation: resetTransientConversation,
      onUpdateSelectedSessionIndex: updateSelectedSessionIndex,
      onUpdateThinking: updateThinking,
      onClearActiveTaskIntent: clearActiveTaskIntent,
    });
  });

  const applyKernelResult = useEffectEvent((
    result: TuiSessionResult,
    source: SessionUpdateSource = "command",
  ) => {
    syncSessionState(result, source);
  });

  const handleKernelEvent = useEffectEvent((event: TuiKernelEvent) => {
    applyKernelEventToApp(event, {
      activeThreadId: activeThreadIdRef.current,
      modelStatus: conversationStateRef.current.modelStatus,
      session: sessionRef.current,
      onMarkLiveSessionActivity: () => {
        hasLiveSessionActivityRef.current = true;
      },
      onRememberActiveThreadId: (threadId) => {
        activeThreadIdRef.current = threadId;
      },
      onRememberSession: (nextSession) => {
        sessionRef.current = nextSession;
      },
      onSetSession: setSession,
      onResetConversationForThreadChange: resetConversationForThreadChange,
      onResetTransientConversation: resetTransientConversation,
      onUpdateSelectedSessionIndex: updateSelectedSessionIndex,
      onUpdateThinking: updateThinking,
      onClearActiveTaskIntent: clearActiveTaskIntent,
      onSetRuntimeStatus: setRuntimeStatus,
      onSetModelStatus: setConversationModelStatus,
      onApplyStreamThinkingChunk: applyStreamThinkingChunk,
      onApplyStreamTextChunk: applyStreamTextChunk,
    });
  });

  const inputKernelInterrupt = useCallback(async () => {
    if (!input.kernel.interruptCurrentThread) {
      return;
    }

    hasLiveSessionActivityRef.current = true;
    const result = await input.kernel.interruptCurrentThread();
    if (result) {
      syncSessionState(result, "command");
    }
  }, [input.kernel]);

  useEffect(() => {
    let interval: Timer | undefined;

    if (conversationState.modelStatus === "thinking") {
      const start = Date.now();
      updateConversationState((current) => ({
        ...current,
        metricsStart: current.metricsStart.thinking
          ? current.metricsStart
          : { thinking: start },
        performance: { waitMs: 0, genMs: 0 },
      }));
      interval = setInterval(() => {
        updateConversationState((current) => {
          const thinkingStart = current.metricsStart.thinking ?? start;
          return {
            ...current,
            performance: { ...current.performance, waitMs: Date.now() - thinkingStart },
          };
        });
      }, 100);
    } else if (conversationState.modelStatus === "responding") {
      const start = Date.now();
      const thinkingStart = conversationStateRef.current.metricsStart.thinking;
      const waitTime = thinkingStart ? start - thinkingStart : 0;
      updateConversationState((current) => ({
        ...current,
        metricsStart: current.metricsStart.responding
          ? current.metricsStart
          : { ...current.metricsStart, responding: start },
        performance: { ...current.performance, waitMs: waitTime, genMs: 0 },
      }));
      interval = setInterval(() => {
        updateConversationState((current) => {
          const respondingStart = current.metricsStart.responding ?? start;
          return {
            ...current,
            performance: { ...current.performance, genMs: Date.now() - respondingStart },
          };
        });
      }, 100);
    } else {
      updateConversationState((current) => {
        if (current.metricsStart.thinking === undefined && current.metricsStart.responding === undefined) {
          return current;
        }
        return {
          ...current,
          metricsStart: {},
        };
      });
    }

    return () => { if (interval) clearInterval(interval); };
  }, [conversationState.modelStatus]);

  // 清理退出确认超时
  useEffect(() => {
    return () => {
      if (exitConfirmTimeoutRef.current) {
        clearTimeout(exitConfirmTimeoutRef.current);
        exitConfirmTimeoutRef.current = undefined;
      }
    };
  }, []);

  function nextMessageId(prefix: "user" | "assistant") {
    messageIdRef.current += 1;
    return `${prefix}-${messageIdRef.current}`;
  }

  useEffect(() => {
    return input.kernel.events.subscribe((event) => {
      handleKernelEvent(event);
    });
  }, [input.kernel]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      // Defer hydration to avoid race with initial render
      await new Promise(resolve => setTimeout(resolve, 50));
      if (cancelled) return;
      if (!input.kernel.hydrateSession) return;
      const result = await input.kernel.hydrateSession();
      if (cancelled || !result) return;
      if (hasLiveSessionActivityRef.current) return;
      applyKernelResult(result, "hydrate");
    }
    void hydrate();
    return () => { cancelled = true; };
  }, [input.kernel]);

  const resetConversationMessages = useEffectEvent(() => {
    updateConversationState((current) => ({
      ...current,
      pendingUserMessage: undefined,
      streamedAssistantMessage: undefined,
    }));
  });

  const appendUserMessage = useEffectEvent((content: string) => {
    updateConversationState((current) => ({
      ...current,
      pendingUserMessage: {
        id: nextMessageId("user"),
        role: "user" as const,
        content,
        timestamp: Date.now(),
      },
      streamedAssistantMessage: undefined,
      streamScrollOffset: 0,
    }));
  });

  const submitEvent = useEffectEvent(async (text: string) => {
    await submitComposerInput(
      {
        launchState,
        session,
        modelStatus: conversationStateRef.current.modelStatus,
        activeTaskIntent,
        onMarkLiveSessionActivity: () => {
          hasLiveSessionActivityRef.current = true;
        },
        onApplyKernelResult: applyKernelResult,
        onSetLaunchState: setLaunchState,
        onResetConversationMessages: resetConversationMessages,
        onAppendUserMessage: appendUserMessage,
        onSetActiveTaskIntent: setActiveTaskIntent,
        onUpdateSelectedSessionIndex: updateSelectedSessionIndex,
        onOpenSettingsPane: openSettingsPane,
        onHandleCommand: input.kernel.handleCommand,
        resolveActiveThreadIndex: () =>
          findActiveThreadIndex(sessionRef.current ?? {
            threadId: session?.threadId,
            threads: session?.threads ?? [],
          }),
      },
      text,
    );
  });

  const submit = useCallback((text: string) => {
    return submitEvent(text);
  }, []);

  const stage: SessionStage = deriveInteractiveStage({
    session,
    activeTaskIntent,
    modelStatus: conversationState.modelStatus,
  });

  const composerMode = resolveComposerMode(session);

  const handleCommandMenuOpenChange = useCallback((isOpen: boolean) => {
    setLaunchState((current) =>
      current.isCommandMenuOpen === isOpen ? current : { ...current, isCommandMenuOpen: isOpen },
    );
  }, []);

  const handleComposerEscape = useCallback(async () => {
    if (!launchState.isCommandMenuOpen && launchState.activeUtilityPane !== "settings") {
      await inputKernelInterrupt();
    }
  }, [inputKernelInterrupt, launchState.activeUtilityPane, launchState.isCommandMenuOpen]);

  const handleSettingsClose = useCallback(() => {
    setLaunchState((current) => ({ ...current, activeUtilityPane: "none" }));
  }, []);

  const utilitySessionSnapshot = useMemo(
    () => {
      const nextSnapshot = buildUtilitySessionSnapshot(session);
      if (isSameUtilitySessionSnapshot(utilitySessionSnapshotRef.current, nextSnapshot)) {
        return utilitySessionSnapshotRef.current;
      }

      utilitySessionSnapshotRef.current = nextSnapshot;
      return nextSnapshot;
    },
    [session],
  );

  const displayMessages = useMemo(
    () => buildDisplayMessages({
      session,
      pendingUserMessage: conversationState.pendingUserMessage,
      streamedAssistantMessage: conversationState.streamedAssistantMessage,
    }),
    [conversationState.pendingUserMessage, conversationState.streamedAssistantMessage, session],
  );

  const conversationView = useMemo<ScreenConversationView>(() => {
    return buildConversationView({
      conversationState: {
        ...conversationState,
        messages: displayMessages,
      },
      session,
      hasCreatedThreadThisLaunch: launchState.hasCreatedThreadThisLaunch,
    });
  }, [
    conversationState.modelStatus,
    conversationState.pendingUserMessage,
    conversationState.performance,
    conversationState.streamedAssistantMessage,
    conversationState.streamScrollOffset,
    displayMessages,
    launchState.hasCreatedThreadThisLaunch,
    session?.approvals,
    session?.answers,
    session?.messages,
    session?.narrativeSummary,
    session?.tasks,
    session?.summary,
    session?.workers,
  ]);

  const utilityView = useMemo<ScreenUtilityView>(() => {
    return buildUtilityView({
      activeUtilityPane: launchState.activeUtilityPane,
      utilitySession: utilitySessionSnapshot,
      settingsConfig,
      selectedSessionIndex,
    });
  }, [
    launchState.activeUtilityPane,
    selectedSessionIndex,
    settingsConfig,
    utilitySessionSnapshot,
  ]);

  const chromeView = useMemo<ScreenChromeView>(() => {
    return buildChromeView({
      session,
      runtimeStatus,
      stage,
      showThreadPanel,
      modelName: process.env.OPENAI_MODEL ?? "unknown",
      thinkingLevel: process.env.OPENPX_THINKING ?? "default",
      exitConfirmText: isExitConfirming ? "Press Ctrl+C again to exit" : undefined,
    });
  }, [
    runtimeStatus,
    session?.blockingReason,
    session?.projectId,
    session?.recommendationReason,
    session?.threadId,
    session?.threads,
    session?.workspaceRoot,
    showThreadPanel,
    stage,
    isExitConfirming,
  ]);

  const composerView = useMemo<ScreenComposerView>(() => {
    return buildComposerView({
      composerMode,
      submit,
      onCommandMenuOpenChange: handleCommandMenuOpenChange,
      onComposerEscape: handleComposerEscape,
      onSettingsSave: saveSettings,
      onSettingsClose: handleSettingsClose,
    });
  }, [composerMode, handleCommandMenuOpenChange, handleComposerEscape, handleSettingsClose, saveSettings, submit]);

  return (
    <Screen
      conversationView={conversationView}
      utilityView={utilityView}
      chromeView={chromeView}
      composerView={composerView}
    />
  );
}
