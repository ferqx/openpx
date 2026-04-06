import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

export interface StatusBarProps {
  modelName?: string;
  thinkingLevel?: string;
  workspaceRoot: string;
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
  const color = normalized === "off" ? theme.colors.dim : theme.colors.secondary;
  return { label, color };
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

export function StatusBar({ modelName, thinkingLevel, workspaceRoot }: StatusBarProps) {
  const thinking = getThinkingDisplay(thinkingLevel);

  return (
    <Box paddingX={1} justifyContent="space-between">
      <Box gap={1}>
        <Text color={theme.colors.primary} bold>{modelName ?? "unknown"}</Text>
        <Text color={theme.colors.dim}>|</Text>
        <Text color={thinking.color}>推理:{thinking.label}</Text>
      </Box>

      <Box gap={1}>
        <Text color={theme.colors.dim}>{truncatePath(workspaceRoot)}</Text>
      </Box>
    </Box>
  );
}
