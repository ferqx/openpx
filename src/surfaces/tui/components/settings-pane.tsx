import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SessionStage } from "../runtime/runtime-session";
import type { ResolvedSettingsConfig } from "../settings/config-resolver";
import {
  SETTINGS_CONFIG_KEYS,
  type PartialSettingsConfig,
  type SettingsConfig,
  type SettingsConfigKey,
  type SettingsConfigScope,
  type SettingsConfigSource,
} from "../settings/config-types";

/** settings pane 的 tab 类型 */
type SettingsTab = "status" | "config" | "usage";

const TAB_ORDER: SettingsTab[] = ["status", "config", "usage"];

const SETTING_LABELS: Record<SettingsConfigKey, string> = {
  autoCompact: "Auto-compact",
  showTips: "Show tips",
  reduceMotion: "Reduce motion",
  thinkingMode: "Thinking mode",
  fastMode: "Fast mode",
  promptSuggestions: "Prompt suggestions",
  rewindCode: "Rewind code",
  verboseOutput: "Verbose output",
  terminalProgressBar: "Terminal progress bar",
};

/** 格式化配置来源文案 */
function formatSource(source: SettingsConfigSource): string {
  switch (source) {
    case "user":
    case "project":
    case "project-local":
      return source;
    default:
      return "default";
  }
}

/** 循环切换 tab */
function cycleTab(tab: SettingsTab): SettingsTab {
  const index = TAB_ORDER.indexOf(tab);
  return TAB_ORDER[(index + 1) % TAB_ORDER.length] ?? "config";
}

/** 渲染 tab 标签 */
function renderTabLabel(tab: SettingsTab, activeTab: SettingsTab): string {
  const label = tab === "status" ? "Status" : tab === "config" ? "Config" : "Usage";
  return activeTab === tab ? `[${label}]` : label;
}

function resolveProjectLocalBaseConfig(input: {
  user: SettingsConfig;
  project: PartialSettingsConfig;
}): SettingsConfig {
  return {
    ...input.user,
    ...input.project,
  };
}

function normalizeProjectLocalOverrides(input: {
  base: SettingsConfig;
  overrides: PartialSettingsConfig;
}): PartialSettingsConfig {
  const normalized: PartialSettingsConfig = {};
  for (const key of SETTINGS_CONFIG_KEYS) {
    const override = input.overrides[key];
    if (override !== undefined && override !== input.base[key]) {
      normalized[key] = override;
    }
  }
  return normalized;
}

/** SettingsPane：状态、配置和帮助三合一的本地设置面板 */
export function SettingsPane(input: {
  modelName?: string;
  thinkingLevel?: string;
  workspaceRoot?: string;
  threadId?: string;
  stage?: SessionStage;
  config: ResolvedSettingsConfig;
  onSave: (scope: SettingsConfigScope, config: PartialSettingsConfig) => Promise<void> | void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("config");
  const [scope, setScope] = useState<SettingsConfigScope>("user");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [draftUser, setDraftUser] = useState(input.config.user);
  const [draftProjectLocal, setDraftProjectLocal] = useState<PartialSettingsConfig>(input.config.projectLocal);
  const scopeRef = useRef<SettingsConfigScope>("user");
  const draftUserRef = useRef(draftUser);
  const draftProjectLocalRef = useRef(draftProjectLocal);

  useEffect(() => {
    setDraftUser(input.config.user);
    setDraftProjectLocal(input.config.projectLocal);
    draftUserRef.current = input.config.user;
    draftProjectLocalRef.current = input.config.projectLocal;
  }, [input.config]);

  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  const filteredKeys = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    return (Object.keys(SETTING_LABELS) as SettingsConfigKey[]).filter((key) => {
      if (!normalized) {
        return true;
      }

      return SETTING_LABELS[key].toLowerCase().includes(normalized);
    });
  }, [searchQuery]);

  useEffect(() => {
    if (selectedIndex >= filteredKeys.length) {
      setSelectedIndex(0);
    }
  }, [filteredKeys.length, selectedIndex]);

  const projectLocalBase = useMemo(
    () =>
      resolveProjectLocalBaseConfig({
        user: draftUser,
        project: input.config.project,
      }),
    [draftUser, input.config.project],
  );

  const projectLocalEffective = useMemo<SettingsConfig>(
    () => ({
      ...projectLocalBase,
      ...draftProjectLocal,
    }),
    [draftProjectLocal, projectLocalBase],
  );

  useInput(async (keyValue, key) => {
    if (searchMode) {
      if (key.return) {
        setSearchMode(false);
        return;
      }

      if (key.backspace || key.delete) {
        setSearchQuery((current) => current.slice(0, -1));
        return;
      }

      if (key.escape) {
        input.onClose();
        return;
      }

      if (!(key.ctrl || key.meta || key.tab)) {
        setSearchQuery((current) => current + keyValue);
      }
      return;
    }

    if (key.escape) {
      input.onClose();
      return;
    }

    if (key.tab) {
      setActiveTab((current) => cycleTab(current));
      return;
    }

    if (activeTab !== "config") {
      return;
    }

    if (keyValue === "/") {
      setSearchMode(true);
      setSearchQuery("");
      return;
    }

    if (keyValue.toLowerCase() === "g") {
      scopeRef.current = "user";
      setScope("user");
      return;
    }

    if (keyValue.toLowerCase() === "p") {
      scopeRef.current = "project-local";
      setScope("project-local");
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((current) => Math.min(current + 1, Math.max(filteredKeys.length - 1, 0)));
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    const selectedKey = filteredKeys[selectedIndex];
    if (!selectedKey) {
      return;
    }

    if (keyValue === " ") {
      setSaveError(undefined);
      if (scopeRef.current === "user") {
        const next = {
          ...draftUserRef.current,
          [selectedKey]: !draftUserRef.current[selectedKey],
        };
        draftUserRef.current = next;
        setDraftUser(next);
      } else {
        const nextValue = !projectLocalEffective[selectedKey];
        const next: PartialSettingsConfig = {
          ...draftProjectLocalRef.current,
        };
        if (nextValue === projectLocalBase[selectedKey]) {
          delete next[selectedKey];
        } else {
          next[selectedKey] = nextValue;
        }
        draftProjectLocalRef.current = next;
        setDraftProjectLocal(next);
      }
      return;
    }

    if (key.return) {
      const nextScope = scopeRef.current;
      const nextConfig = nextScope === "user"
        ? draftUserRef.current
        : normalizeProjectLocalOverrides({
            base: projectLocalBase,
            overrides: draftProjectLocalRef.current,
          });
      try {
        setSaveError(undefined);
        await input.onSave(
          nextScope,
          nextConfig,
        );
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error));
      }
    }
  });

  useEffect(() => {
    draftUserRef.current = draftUser;
  }, [draftUser]);

  useEffect(() => {
    draftProjectLocalRef.current = draftProjectLocal;
  }, [draftProjectLocal]);

  const effectiveConfig = {
    ...draftUser,
    ...input.config.project,
    ...projectLocalEffective,
  };

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={1}
    >
      <Text>
        {renderTabLabel("status", activeTab)}   {renderTabLabel("config", activeTab)}   {renderTabLabel("usage", activeTab)}
      </Text>
      {activeTab === "status" ? (
        <Box flexDirection="column" marginTop={1}>
          <Text>Model: {input.modelName ?? "unknown"}</Text>
          <Text>Thinking level: {input.thinkingLevel ?? "default"}</Text>
          <Text>Workspace: {input.workspaceRoot ?? "unknown"}</Text>
          <Text>Thread: {input.threadId ?? "new"}</Text>
          <Text>Stage: {input.stage ?? "idle"}</Text>
          <Text>Active scope editor: {scope === "user" ? "User" : "Project local"}</Text>
          <Text>Prompt suggestions: {String(input.config.effective.promptSuggestions)}</Text>
        </Box>
      ) : null}

      {activeTab === "config" ? (
        <Box flexDirection="column" marginTop={1}>
          <Text>Scope: {scope === "user" ? "User" : "Project local"}</Text>
          <Text>Search: {searchQuery.length > 0 ? searchQuery : "Search settings..."}</Text>
          <Box flexDirection="column" marginTop={1}>
            {filteredKeys.map((key, index) => {
              const selected = index === selectedIndex;
              const value = scope === "user" ? draftUser[key] : projectLocalEffective[key];
              const source = input.config.sources[key];
              return (
                <Box key={key} gap={1}>
                  <Text>{selected ? "❯" : " "}</Text>
                  <Text>{SETTING_LABELS[key]}</Text>
                  <Text>{String(value)}</Text>
                  <Text color="gray">({formatSource(source)})</Text>
                </Box>
              );
            })}
          </Box>
          <Text color="gray" dimColor>
            Effective prompt suggestions: {String(effectiveConfig.promptSuggestions)}
          </Text>
          {saveError ? <Text color="red">Save failed: {saveError}</Text> : null}
          <Text color="gray">Scope: {scope === "user" ? "User" : "Project local"} · u user · p project-local</Text>
        </Box>
      ) : null}

      {activeTab === "usage" ? (
        <Box flexDirection="column" marginTop={1}>
          <Text>/new starts a fresh thread for this TUI launch.</Text>
          <Text>/plan &lt;prompt&gt; starts a planning-first task that the kernel can continue into execution.</Text>
          <Text>/history, /sessions, /help, /settings are local shell commands.</Text>
          <Text>Space toggles the selected config value. Enter saves the active scope.</Text>
          <Text>/ opens settings search. Esc closes settings.</Text>
          <Text>Approval waits for user confirmation; interrupted runs can be continued with new input.</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color="gray">Space to change · Enter to save · / to search · Esc to cancel</Text>
      </Box>
    </Box>
  );
}
