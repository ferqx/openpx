import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { RuntimeSessionState } from "../../runtime/runtime-session";

export type ThreadSummary = RuntimeSessionState["threads"][number];

function getStatusIndicator(status: string) {
  switch (status) {
    case "active":
      return <Text color="green">{theme.symbols.activeStep}</Text>;
    case "blocked":
    case "waiting_approval":
      return <Text color="yellow">{theme.symbols.warning}</Text>;
    case "completed":
      return <Text color="green">{theme.symbols.success}</Text>;
    case "failed":
      return <Text color="red">{theme.symbols.failure}</Text>;
    default:
      return <Text color="gray">○</Text>;
  }
}

export function ThreadPanel(input: { threads: ThreadSummary[]; activeThreadId?: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} marginBottom={1}>
      <Text bold>THREADS</Text>
      {input.threads.length === 0 ? <Text color="gray">No threads yet</Text> : null}
      {input.threads.map((thread) => (
        <Box key={thread.threadId} flexDirection="column" marginBottom={1}>
          <Box gap={1}>
            {getStatusIndicator(thread.status)}
            <Text>
              {thread.threadId}
              {thread.threadId === input.activeThreadId ? " (active)" : ""} [{thread.status}]
            </Text>
            {thread.pendingApprovalCount ? <Text color="yellow">approval:{thread.pendingApprovalCount}</Text> : null}
            {thread.blockingReasonKind ? <Text color="yellow">{thread.blockingReasonKind}</Text> : null}
          </Box>
          {thread.narrativeSummary ? (
            <Box marginLeft={2}>
              <Text color={theme.colors.dim}>{thread.narrativeSummary}</Text>
            </Box>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}
