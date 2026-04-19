import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { RuntimeSessionState } from "../runtime/runtime-session";

/** ThreadPanel 使用的线程摘要类型 */
export type ThreadSummary = RuntimeSessionState["threads"][number];

/** 根据线程/运行状态选择面板图标 */
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

/** ThreadPanel：展示当前 scope 下线程列表及其摘要 */
export const ThreadPanel = React.memo(function ThreadPanel(input: { threads: ThreadSummary[]; activeThreadId?: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.dim} paddingX={1} marginBottom={1}>
      <Text color={theme.colors.dim}>threads</Text>
      {input.threads.length === 0 ? <Text color="gray">No threads yet</Text> : null}
      {input.threads.map((thread) => (
        <Box key={thread.threadId} flexDirection="column" marginBottom={1}>
          {(() => {
            const displayStatus = thread.activeRunStatus ?? thread.status;
            return (
          <Box gap={1}>
            {getStatusIndicator(displayStatus)}
            <Text>{thread.threadId}</Text>
            <Text color={theme.colors.dim}>{thread.threadId === input.activeThreadId ? "active" : displayStatus}</Text>
            <Text color={theme.colors.dim}>{`mode:${thread.threadMode}`}</Text>
            {thread.pendingApprovalCount ? <Text color="yellow">{thread.pendingApprovalCount} approval</Text> : null}
            {thread.blockingReasonKind ? <Text color="yellow">{thread.blockingReasonKind === "human_recovery" ? "recovery" : thread.blockingReasonKind}</Text> : null}
          </Box>
            );
          })()}
          {thread.narrativeSummary ? (
            <Box marginLeft={2}>
              <Text color={theme.colors.dim}>{thread.narrativeSummary}</Text>
            </Box>
          ) : null}
        </Box>
      ))}
    </Box>
  );
});
