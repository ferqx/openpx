import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { TaskSummary } from './task-panel';
import type { ApprovalSummary } from './approval-panel';
import type { AgentRunSummary } from './agent-run-panel';
import type { PlanDecisionRequest } from '../../../runtime/planning/planner-result';
import { AgentRunPanel } from './agent-run-panel';
import { theme } from '../theme';
import { Markdown } from './markdown';

/** InteractionStream 内部消息模型 */
type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  thinkingDuration?: number;
  timestamp: number;
};

/** InteractionStream 渲染所需 props */
export interface InteractionStreamProps {
  messages: Message[];
  tasks: TaskSummary[];
  approvals: ApprovalSummary[];
  agentRuns: AgentRunSummary[];
  planDecision?: PlanDecisionRequest;
  modelStatus?: string;
  performance?: { waitMs: number; genMs: number };
  narrativeSummary?: string;
  viewportWidth?: number;
  scrollOffset?: number;
}

/** 格式化 thinking 耗时 */
function formatDuration(ms?: number): string {
  if (!ms) return '';
  return ` (${(ms / 1000).toFixed(1)}s)`;
}

/** 估算文本换行后的可见行数 */
function estimateWrappedLines(text: string, width: number): number {
  const safeWidth = Math.max(8, width);
  const normalizedLines = text.length > 0 ? text.split('\n') : [''];

  return normalizedLines.reduce((total, line) => {
    const lineLength = Math.max(1, line.length);
    return total + Math.ceil(lineLength / safeWidth);
  }, 0);
}

function estimateMessageLines(message: Message, width: number): number {
  let total = message.role === 'user' ? 1 : 2;

  if (message.role === 'assistant' && message.thinking) {
    total +=
      1 +
      estimateWrappedLines(message.thinking, width - theme.spacing.indent * 2);
  }

  total += estimateWrappedLines(
    message.content,
    width - theme.spacing.indent * 2
  );
  return total + 1;
}

function buildScrollIndicator(height: number): string {
  if (height <= 1) {
    return '↑';
  }

  const rows = Array.from({ length: height }, (_, index) => {
    if (index === 0) {
      return '↑';
    }

    if (index === height - 1) {
      return '•';
    }

    return '│';
  });

  return rows.join('\n');
}

function clampScrollOffset(offset: number, maxOffset: number): number {
  return Math.max(0, Math.min(offset, maxOffset));
}

export function InteractionStream({
  messages,
  tasks,
  approvals,
  agentRuns,
  planDecision,
  modelStatus,
  performance,
  narrativeSummary,
  viewportWidth,
  scrollOffset = 0
}: InteractionStreamProps) {
  const SpinnerComponent = Spinner as React.ComponentType<{ type?: string }>;
  const shouldRenderNarrativeFallback =
    messages.length === 0 &&
    approvals.length === 0 &&
    !planDecision &&
    tasks.length === 0 &&
    agentRuns.length === 0 &&
    Boolean(narrativeSummary);
  const contentWidth = Math.max(24, (viewportWidth ?? 80) - 6);
  const estimatedConversationLines =
    messages.reduce(
      (total, message) => total + estimateMessageLines(message, contentWidth),
      0
    ) +
    (shouldRenderNarrativeFallback
      ? estimateWrappedLines(narrativeSummary ?? '', contentWidth) + 2
      : 0) +
    (modelStatus === 'thinking' || modelStatus === 'responding' ? 2 : 0) +
    (planDecision ? planDecision.options.length + 4 : 0) +
    tasks.filter((task) => task.status === 'running').length +
    agentRuns.length +
    approvals.length * 3;
  const pageSize = 10;
  const messagesOverflow = messages.length > pageSize;
  const maxScrollOffset = messagesOverflow
    ? Math.max(0, messages.length - pageSize)
    : 0;
  const effectiveScrollOffset = clampScrollOffset(
    scrollOffset,
    maxScrollOffset
  );
  const streamOverflowed = messagesOverflow;
  const visibleMessages = messagesOverflow
    ? messages.slice(
        Math.max(0, messages.length - pageSize - effectiveScrollOffset),
        messages.length - effectiveScrollOffset
      )
    : messages;
  const scrollIndicator = streamOverflowed ? buildScrollIndicator(8) : '';
  const canScrollUp = streamOverflowed;
  const canScrollDown = streamOverflowed && effectiveScrollOffset > 0;

  return (
    <Box flexDirection="row" gap={1}>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {/* Conversation History */}
        <Box flexDirection="column" marginBottom={1}>
          {visibleMessages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <Box key={msg.id} marginBottom={1}>
                  <Text color={theme.colors.primary}>
                    {theme.symbols.prompt}{' '}
                  </Text>
                  <Text>{msg.content}</Text>
                </Box>
              );
            }

            return (
              <Box key={msg.id} flexDirection="column" marginBottom={1}>
                {msg.thinking && (
                  <Box flexDirection="column" marginBottom={1}>
                    <Text color={theme.colors.dim}>
                      {`reasoning${formatDuration(msg.thinkingDuration)}`}
                    </Text>
                    <Text color={theme.colors.dim}>{msg.thinking}</Text>
                  </Box>
                )}
                <Box flexDirection="column">
                  <Text color={theme.colors.dim}>assistant</Text>
                  <Markdown>{msg.content}</Markdown>
                </Box>
              </Box>
            );
          })}
          {shouldRenderNarrativeFallback ? (
            <Box flexDirection="column" marginBottom={1}>
              <Box flexDirection="column">
                <Markdown>{narrativeSummary ?? ''}</Markdown>
              </Box>
            </Box>
          ) : null}
        </Box>

        {/* Real-time Status / Thinking State */}
        {(modelStatus === 'thinking' || modelStatus === 'responding') && (
          <Box marginBottom={1} gap={1}>
            <Text color={theme.colors.dim}>
              ● {modelStatus === 'thinking' ? 'thinking' : 'responding'}
              {performance &&
                ` (${((modelStatus === 'thinking' ? performance.waitMs : performance.genMs) / 1000).toFixed(1)}s)`}
            </Text>
          </Box>
        )}

        {/* Active Tasks & Approvals */}
        <Box flexDirection="column">
          {tasks
            .filter((t) => t.status === 'running')
            .map((task) => (
              <Box key={task.taskId} marginLeft={0} gap={1}>
                <Text color={theme.colors.primary}>
                  <SpinnerComponent type="dots" />
                </Text>
                <Text color={theme.colors.dim}>{task.summary}...</Text>
              </Box>
            ))}
          {approvals.map((approval) => (
            <Box
              key={approval.approvalRequestId}
              paddingX={1}
              borderStyle="round"
              borderColor="yellow"
              marginBottom={1}
              flexDirection="column"
            >
              <Box gap={1}>
                <Text bold color="yellow">
                  {theme.symbols.warning} Action Required:
                </Text>
                <Text>{approval.summary}</Text>
              </Box>
              <Box marginLeft={2}>
                <Text color={theme.colors.dim}>
                  Type 'yes' to approve or 'no' to reject.
                </Text>
              </Box>
            </Box>
          ))}
          {planDecision ? (
            <Box
              paddingX={1}
              borderStyle="round"
              borderColor="cyan"
              marginBottom={1}
              flexDirection="column"
            >
              <Box gap={1}>
                <Text bold color="cyan">
                  方案选择:
                </Text>
                <Text>{planDecision.question}</Text>
              </Box>
              {planDecision.options.map((option, index) => (
                <Box key={option.id} marginLeft={2} gap={1}>
                  <Text color="cyan">{`${index + 1}.`}</Text>
                  <Text bold>{option.label}</Text>
                  <Text color={theme.colors.dim}>{option.description}</Text>
                </Box>
              ))}
              <Box marginLeft={2}>
                <Text color={theme.colors.dim}>输入数字选择方案并继续执行。</Text>
              </Box>
            </Box>
          ) : null}
          <AgentRunPanel agentRuns={agentRuns} />
        </Box>
      </Box>

      {streamOverflowed ? (
        <Box flexDirection="column" width={10}>
          {canScrollUp ? <Text color={theme.colors.dim}>history ↑</Text> : null}
          {Array.from({ length: 6 }).map((_, i) => (
            <Text key={i} color={theme.colors.dim}>
              │
            </Text>
          ))}
          {canScrollDown ? <Text color={theme.colors.dim}>live ↓</Text> : null}
        </Box>
      ) : null}
    </Box>
  );
}
