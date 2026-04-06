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
}

function formatDuration(ms?: number): string {
  if (!ms) return "";
  return ` (${(ms / 1000).toFixed(1)}s)`;
}

export function InteractionStream({
  messages,
  tasks,
  approvals,
  modelStatus,
  performance,
  narrativeSummary,
}: InteractionStreamProps) {
  const SpinnerComponent = Spinner as React.ComponentType<{ type?: string }>;
  const shouldRenderNarrativeFallback =
    messages.length === 0 && approvals.length === 0 && tasks.length === 0 && Boolean(narrativeSummary);

  return (
    <Box flexDirection="column">
      {/* Conversation History */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg) => {
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
              {/* Thinking section */}
              {msg.thinking && (
                <Box flexDirection="column" marginBottom={1} paddingLeft={theme.spacing.indent}>
                  <Text color={theme.colors.dim}>
                    Thinking{formatDuration(msg.thinkingDuration)}
                  </Text>
                  <Text color={theme.colors.dim}>{msg.thinking}</Text>
                </Box>
              )}

              {/* Agent response with markdown rendering */}
              <Box paddingLeft={theme.spacing.indent}>
                <Text color={theme.colors.secondary}>Agent: </Text>
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
              <Text color={theme.colors.secondary}>Agent: </Text>
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
            ● {modelStatus === "thinking" ? "Thinking..." : "Responding..."}
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
            <Text color={theme.colors.primary}>{task.summary}...</Text>
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
  );
}
