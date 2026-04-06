import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SessionStage } from "../../runtime/runtime-session";
import type { ResolvedSettingsConfig } from "../settings/config-resolver";
import type {
  SettingsConfig,
  SettingsConfigKey,
  SettingsConfigScope,
  SettingsConfigSource,
} from "../settings/config-types";

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

function formatSource(source: SettingsConfigSource): string {
  return source === "project" ? "project" : source === "global" ? "global" : "default";
}

function cycleTab(tab: SettingsTab): SettingsTab {
  const index = TAB_ORDER.indexOf(tab);
  return TAB_ORDER[(index + 1) % TAB_ORDER.length] ?? "config";
}

function renderTabLabel(tab: SettingsTab, activeTab: SettingsTab): string {
  const label = tab === "status" ? "Status" : tab === "config" ? "Config" : "Usage";
  return activeTab === tab ? `[${label}]` : label;
}

export function SettingsPane(input: {
  modelName?: string;
  thinkingLevel?: string;
  workspaceRoot?: string;
  threadId?: string;
  stage?: SessionStage;
  config: ResolvedSettingsConfig;
  onSave: (scope: SettingsConfigScope, config: SettingsConfig) => Promise<void> | void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("config");
  const [scope, setScope] = useState<SettingsConfigScope>("global");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [draftGlobal, setDraftGlobal] = useState(input.config.global);
  const [draftProject, setDraftProject] = useState<SettingsConfig>({
    ...input.config.global,
    ...input.config.project,
  });
  const scopeRef = useRef<SettingsConfigScope>("global");
  const draftGlobalRef = useRef(draftGlobal);
  const draftProjectRef = useRef(draftProject);

  useEffect(() => {
    setDraftGlobal(input.config.global);
    setDraftProject({
      ...input.config.global,
      ...input.config.project,
    });
    draftGlobalRef.current = input.config.global;
    draftProjectRef.current = {
      ...input.config.global,
      ...input.config.project,
    };
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
      scopeRef.current = "global";
      setScope("global");
      return;
    }

    if (keyValue.toLowerCase() === "p") {
      scopeRef.current = "project";
      setScope("project");
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
      if (scopeRef.current === "global") {
        const next = {
          ...draftGlobalRef.current,
          [selectedKey]: !draftGlobalRef.current[selectedKey],
        };
        draftGlobalRef.current = next;
        setDraftGlobal(next);
      } else {
        const next = {
          ...draftProjectRef.current,
          [selectedKey]: !draftProjectRef.current[selectedKey],
        };
        draftProjectRef.current = next;
        setDraftProject(next);
      }
      return;
    }

    if (key.return) {
      const nextScope = scopeRef.current;
      await input.onSave(
        nextScope,
        nextScope === "global" ? draftGlobalRef.current : draftProjectRef.current,
      );
    }
  });

  useEffect(() => {
    draftGlobalRef.current = draftGlobal;
  }, [draftGlobal]);

  useEffect(() => {
    draftProjectRef.current = draftProject;
  }, [draftProject]);

  const effectiveConfig = {
    ...draftGlobal,
    ...(scope === "project" ? draftProject : input.config.project),
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
          <Text>Active scope editor: {scope === "global" ? "Global" : "Project"}</Text>
          <Text>Prompt suggestions: {String(input.config.effective.promptSuggestions)}</Text>
        </Box>
      ) : null}

      {activeTab === "config" ? (
        <Box flexDirection="column" marginTop={1}>
          <Text>Scope: {scope === "global" ? "Global" : "Project"}</Text>
          <Text>Search: {searchQuery.length > 0 ? searchQuery : "Search settings..."}</Text>
          <Box flexDirection="column" marginTop={1}>
            {filteredKeys.map((key, index) => {
              const selected = index === selectedIndex;
              const value = scope === "global" ? draftGlobal[key] : draftProject[key];
              const source =
                scope === "global"
                  ? "global"
                  : input.config.project[key] !== undefined
                    ? "project"
                    : input.config.global[key] !== undefined
                      ? "global"
                      : "default";
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
          <Text color="gray">Scope: {scope === "global" ? "Global" : "Project"} · g global · p project</Text>
        </Box>
      ) : null}

      {activeTab === "usage" ? (
        <Box flexDirection="column" marginTop={1}>
          <Text>/new starts a fresh thread for this TUI launch.</Text>
          <Text>/plan &lt;prompt&gt; starts a planning-first task that the kernel can continue into execution.</Text>
          <Text>/history, /sessions, /help, /settings are local shell commands.</Text>
          <Text>Space toggles the selected config value. Enter saves the active scope.</Text>
          <Text>/ opens settings search. Esc closes settings.</Text>
          <Text>Approval waits for user confirmation; blocked means human recovery is required.</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color="gray">Space to change · Enter to save · / to search · Esc to cancel</Text>
      </Box>
    </Box>
  );
}
