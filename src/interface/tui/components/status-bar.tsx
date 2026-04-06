import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { SessionStage } from "../../runtime/runtime-session";

export interface StatusBarProps {
  modelName?: string;
  thinkingLevel?: string;
  workspaceRoot: string;
  stage?: SessionStage;
}

const THINKING_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
  off: "关",
  default: "默认",
};

function getThinkingDisplay(level?: string): { label: string; color: string } {
  if (!level) return { label: "—", color: theme.colors.dim };
  const normalized = level.toLowerCase();
  const label = THINKING_LABELS[normalized] ?? normalized;
  return { label, color: theme.colors.dim };
}

function truncatePath(path: string, maxLen = 50): string {
  if (path.length <= maxLen) return path;
  const parts = path.split("/");
  if (parts.length <= 2) return path.slice(0, maxLen) + "…";
  while (parts.length > 2 && parts.join("/").length > maxLen - 3) {
    parts.splice(1, 1);
  }
  return "…/" + parts.slice(-2).join("/");
}

function formatStage(stage?: SessionStage): { label: string; color: string } {
  switch (stage) {
    case "planning":
      return { label: "plan", color: theme.colors.dim };
    case "awaiting_confirmation":
      return { label: "confirm", color: theme.colors.dim };
    case "executing":
      return { label: "run", color: theme.colors.dim };
    case "blocked":
      return { label: "blocked", color: theme.colors.dim };
    default:
      return { label: "idle", color: theme.colors.dim };
  }
}

export const StatusBar = React.memo(function StatusBar({ modelName, thinkingLevel, workspaceRoot, stage }: StatusBarProps) {
  const thinking = getThinkingDisplay(thinkingLevel);
  const stageDisplay = formatStage(stage);

  return (
    <Box paddingX={1} justifyContent="space-between">
      <Box gap={1}>
        <Text color={theme.colors.dim}>{modelName ?? "unknown"}</Text>
        <Text color={theme.colors.dim}>·</Text>
        <Text color={thinking.color}>mode:{thinking.label}</Text>
        <Text color={theme.colors.dim}>·</Text>
        <Text color={stageDisplay.color}>stage:{stageDisplay.label}</Text>
      </Box>

      <Box gap={1}>
        <Text color={theme.colors.dim}>{truncatePath(workspaceRoot)}</Text>
      </Box>
    </Box>
  );
});
