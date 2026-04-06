import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { TaskSummary } from "./task-panel";
import type { ApprovalSummary } from "./approval-panel";
import { theme } from "../theme";
import { Markdown } from "./markdown";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  thinkingDuration?: number;
  timestamp: number;
};

export interface InteractionStreamProps {
  messages: Message[];
  tasks: TaskSummary[];
  approvals: ApprovalSummary[];
  modelStatus?: string;
  performance?: { waitMs: number; genMs: number };
  narrativeSummary?: string;
  viewportHeight?: number;
  viewportWidth?: number;
  scrollOffset?: number;
}

function formatDuration(ms?: number): string {
  if (!ms) return "";
  return ` (${(ms / 1000).toFixed(1)}s)`;
}

function estimateWrappedLines(text: string, width: number): number {
  const safeWidth = Math.max(8, width);
  const normalizedLines = text.length > 0 ? text.split("\n") : [""];

  return normalizedLines.reduce((total, line) => {
    const lineLength = Math.max(1, line.length);
    return total + Math.ceil(lineLength / safeWidth);
  }, 0);
}

function estimateMessageLines(message: Message, width: number): number {
  let total = message.role === "user" ? 1 : 2;

  if (message.role === "assistant" && message.thinking) {
    total += 1 + estimateWrappedLines(message.thinking, width - theme.spacing.indent * 2);
  }

  total += estimateWrappedLines(message.content, width - theme.spacing.indent * 2);
  return total + 1;
}

function buildScrollIndicator(height: number): string {
  if (height <= 1) {
    return "↑";
  }

  const rows = Array.from({ length: height }, (_, index) => {
    if (index === 0) {
      return "↑";
    }

    if (index === height - 1) {
      return "•";
    }

    return "│";
  });

  return rows.join("\n");
}

function clampScrollOffset(offset: number, maxOffset: number): number {
  return Math.max(0, Math.min(offset, maxOffset));
}

export function InteractionStream({
  messages,
  tasks,
  approvals,
  modelStatus,
  performance,
  narrativeSummary,
  viewportHeight,
  viewportWidth,
  scrollOffset = 0,
}: InteractionStreamProps) {
  const SpinnerComponent = Spinner as React.ComponentType<{ type?: string }>;
  const shouldRenderNarrativeFallback =
    messages.length === 0 && approvals.length === 0 && tasks.length === 0 && Boolean(narrativeSummary);
  const contentWidth = Math.max(24, (viewportWidth ?? 80) - 6);
  const estimatedConversationLines =
    messages.reduce((total, message) => total + estimateMessageLines(message, contentWidth), 0) +
    (shouldRenderNarrativeFallback ? estimateWrappedLines(narrativeSummary ?? "", contentWidth) + 2 : 0) +
    (modelStatus === "thinking" || modelStatus === "responding" ? 2 : 0) +
    tasks.filter((task) => task.status === "running").length +
    approvals.length * 3;
  const streamOverflowed =
    (typeof viewportHeight === "number" && estimatedConversationLines > viewportHeight) ||
    messages.length >= 8;
  const pageSize = Math.max(4, Math.floor((viewportHeight ?? 12) / 3));
  const maxScrollOffset = Math.max(0, messages.length - pageSize);
  const effectiveScrollOffset = clampScrollOffset(scrollOffset, maxScrollOffset);
  const visibleMessages =
    streamOverflowed && messages.length > pageSize
      ? messages.slice(
          Math.max(0, messages.length - pageSize - effectiveScrollOffset),
          messages.length - effectiveScrollOffset,
        )
      : messages;
  const scrollIndicator = buildScrollIndicator(Math.max(2, (viewportHeight ?? 6) - 1));
  const canScrollUp = streamOverflowed;
  const canScrollDown = effectiveScrollOffset > 0;

  return (
    <Box flexDirection="row" gap={1}>
      <Box flexDirection="column" flexGrow={1}>
        {/* Conversation History */}
        <Box flexDirection="column" marginBottom={1}>
          {visibleMessages.map((msg) => {
            if (msg.role === "user") {
              return (
                <Box key={msg.id} marginBottom={1}>
                  <Text color={theme.colors.primary}>{theme.symbols.prompt} </Text>
                  <Text>{msg.content}</Text>
                </Box>
              );
            }

            return (
              <Box key={msg.id} flexDirection="column" marginBottom={1}>
                {msg.thinking && (
                  <Box flexDirection="column" marginBottom={1} paddingLeft={theme.spacing.indent}>
                    <Text color={theme.colors.dim}>
                      {`reasoning${formatDuration(msg.thinkingDuration)}`}
                    </Text>
                    <Text color={theme.colors.dim}>{msg.thinking}</Text>
                  </Box>
                )}

                <Box paddingLeft={theme.spacing.indent}>
                  <Text color={theme.colors.secondary}>assistant</Text>
                </Box>
                <Box paddingLeft={theme.spacing.indent * 2} flexDirection="column">
                  <Markdown>{msg.content}</Markdown>
                </Box>
              </Box>
            );
          })}
          {shouldRenderNarrativeFallback ? (
            <Box flexDirection="column" marginBottom={1}>
              <Box paddingLeft={theme.spacing.indent}>
                <Text color={theme.colors.secondary}>assistant</Text>
              </Box>
              <Box paddingLeft={theme.spacing.indent * 2} flexDirection="column">
                <Markdown>{narrativeSummary ?? ""}</Markdown>
              </Box>
            </Box>
          ) : null}
        </Box>

        {/* Real-time Status / Thinking State */}
        {(modelStatus === "thinking" || modelStatus === "responding") && (
          <Box marginBottom={1} gap={1}>
            <Text color={theme.colors.dim}>
              ● {modelStatus === "thinking" ? "thinking" : "responding"}
              {performance && ` (${( (modelStatus === "thinking" ? performance.waitMs : performance.genMs) / 1000).toFixed(1)}s)`}
            </Text>
          </Box>
        )}

        {/* Active Tasks & Approvals */}
        <Box flexDirection="column">
          {tasks.filter(t => t.status === "running").map(task => (
            <Box key={task.taskId} marginLeft={0} gap={1}>
              <Text color={theme.colors.primary}>
                <SpinnerComponent type="dots" />
              </Text>
              <Text color={theme.colors.dim}>{task.summary}...</Text>
            </Box>
          ))}
          {approvals.map(approval => (
            <Box key={approval.approvalRequestId} paddingX={1} borderStyle="round" borderColor="yellow" marginBottom={1} flexDirection="column">
              <Box gap={1}>
                <Text bold color="yellow">{theme.symbols.warning} Action Required:</Text>
                <Text>{approval.summary}</Text>
              </Box>
              <Box marginLeft={2}>
                <Text color={theme.colors.dim}>Type 'yes' to approve or 'no' to reject.</Text>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {streamOverflowed ? (
        <Box flexDirection="column" width={10}>
          {canScrollUp ? <Text color={theme.colors.dim}>history ↑</Text> : null}
          {canScrollDown ? <Text color={theme.colors.dim}>live ↓</Text> : null}
          <Text color={theme.colors.dim}>{scrollIndicator}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
