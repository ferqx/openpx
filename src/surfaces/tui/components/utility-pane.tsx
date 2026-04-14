import React from "react";
import { Box, Text } from "ink";
import type { RuntimeSessionState } from "../runtime/runtime-session";
import type { UtilityPaneMode } from "../view-state";
import { theme } from "../theme";

/** utility pane 读取的最小 session 快照 */
export type UtilityPaneSessionSnapshot = Pick<
  RuntimeSessionState,
  "threadId" | "threads" | "messages" | "answers" | "narrativeSummary" | "workspaceRoot"
>;

/** 生成 history 面板文本：优先 transcript，其次 answer，最后 narrative 摘要 */
function buildHistoryContent(session?: UtilityPaneSessionSnapshot): string {
  if (!session) {
    return "No current thread history yet.";
  }

  const transcript = (session.messages ?? []).map((message) => {
    if (!message.content.trim()) {
      return "";
    }

    return `${message.role}\n${message.content}`;
  }).filter(Boolean);
  if (transcript.length > 0) {
    return transcript.join("\n\n");
  }

  const answers = session.answers.map((answer) => answer.content).filter((content) => content.trim().length > 0);
  if (answers.length > 0) {
    return answers.join("\n\n");
  }

  return session.narrativeSummary ?? "No current thread history yet.";
}

/** 生成 settings 面板文本 */
function buildSettingsContent(input: {
  modelName?: string;
  thinkingLevel?: string;
  workspaceRoot?: string;
}): string {
  return [
    `Model: ${input.modelName ?? "unknown"}`,
    `Thinking level: ${input.thinkingLevel ?? "default"}`,
    `Workspace: ${input.workspaceRoot ?? "unknown"}`,
  ].join("\n");
}

/** 生成 help 面板文本 */
function buildHelpContent(): string {
  return [
    "/new",
    "/plan <prompt>",
    "/history",
    "/sessions",
    "/clear",
    "/settings",
    "/help",
  ].join("\n");
}

/** UtilityPane：history/sessions/settings/help 的统一渲染入口 */
export const UtilityPane = React.memo(function UtilityPane(input: {
  mode: Exclude<UtilityPaneMode, "none">;
  session?: UtilityPaneSessionSnapshot;
  modelName?: string;
  thinkingLevel?: string;
  selectedThreadId?: string;
}) {
  const title =
    input.mode === "history"
      ? "history"
      : input.mode === "sessions"
        ? "sessions"
        : input.mode === "settings"
          ? "settings"
          : "help";

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      marginLeft={theme.spacing.indent}
      marginRight={theme.spacing.indent}
      paddingX={1}
      borderStyle="round"
      borderColor={theme.colors.dim}
    >
      <Box justifyContent="space-between">
        <Text color={theme.colors.secondary}>{title}</Text>
        <Text color={theme.colors.dim}>esc to close</Text>
      </Box>
      {input.mode === "sessions" ? (
        <Box flexDirection="column">
          {/* sessions 面板直接展示 runtime thread truth，不再引入本地派生状态。 */}
          {(input.session?.threads ?? []).map((thread) => {
            const selected = thread.threadId === input.selectedThreadId;
            const active = thread.threadId === input.session?.threadId;
            const displayStatus = thread.activeRunStatus ?? thread.status;
            return (
              <Box key={thread.threadId} gap={1}>
                <Text color={selected ? theme.colors.primary : theme.colors.dim} bold={selected}>
                  {selected ? "❯" : " "}
                </Text>
                <Text color={selected ? theme.colors.primary : undefined} inverse={selected} bold={selected}>
                  {thread.threadId}
                  {active ? " (active)" : ""}
                  {` [${displayStatus}]`}
                  {thread.pendingApprovalCount ? ` approval:${thread.pendingApprovalCount}` : ""}
                  {thread.blockingReasonKind ? ` ${thread.blockingReasonKind}` : ""}
                  {thread.narrativeSummary ? ` ${thread.narrativeSummary}` : ""}
                </Text>
              </Box>
            );
          })}
        </Box>
      ) : input.mode === "history" ? (
        <Text>{buildHistoryContent(input.session)}</Text>
      ) : input.mode === "settings" ? (
        <Text>{buildSettingsContent({
          modelName: input.modelName,
          thinkingLevel: input.thinkingLevel,
          workspaceRoot: input.session?.workspaceRoot,
        })}</Text>
      ) : (
        <Text>{buildHelpContent()}</Text>
      )}
    </Box>
  );
});
