import React from "react";
import { Box, Text } from "ink";
import { InteractionStream } from "./components/interaction-stream";
import { Composer } from "./components/composer";
import { StatusBar } from "./components/status-bar";
import { ThreadPanel, type ThreadSummary } from "./components/thread-panel";
import { theme } from "./theme";
import type { TaskSummary } from "./components/task-panel";
import type { ApprovalSummary } from "./components/approval-panel";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

export function Screen(input: {
  messages: Message[];
  tasks: TaskSummary[];
  approvals: ApprovalSummary[];
  composerMode?: "input" | "confirm" | "blocked";
  blockingReason?: {
    kind: "waiting_approval" | "human_recovery";
    message: string;
  };
  workspaceRoot?: string;
  projectId?: string;
  threadId?: string;
  modelStatus?: string;
  runtimeStatus?: string;
  modelName?: string;
  thinkingLevel?: string;
  recommendationReason?: string;
  narrativeSummary?: string;
  threads?: ThreadSummary[];
  showThreadPanel?: boolean;
  performance?: { waitMs: number; genMs: number };
  onSubmit?: (text: string) => Promise<void> | void;
}) {
  return (
    <Box flexDirection="column" height="100%" paddingX={1}>
      {/* Header */}
      <Box key="header" marginBottom={0} gap={2}>
        <Box>
          <Text bold color={theme.colors.primary}>openpx v1.0</Text>
          <Text color={theme.colors.dim}> | </Text>
          <Text color={theme.colors.secondary}>{input.projectId || "unknown"}</Text>
        </Box>
        <Text color={theme.colors.dim}>{input.workspaceRoot || "unknown"}</Text>
      </Box>

      {input.showThreadPanel && (
        <Box key="thread-panel" marginBottom={1}>
          <ThreadPanel threads={input.threads ?? []} activeThreadId={input.threadId} />
        </Box>
      )}

      {/* Main Interaction Stream */}
      <Box key="stream" flexGrow={1} flexDirection="column">
        <InteractionStream 
          messages={input.messages}
          tasks={input.tasks}
          approvals={input.approvals}
          modelStatus={input.modelStatus}
          performance={input.performance}
          narrativeSummary={input.narrativeSummary}
        />
      </Box>

      {/* Recommendation Prompt */}
      {input.composerMode === "confirm" && input.recommendationReason && (
        <Box key="recommendation" paddingX={1} marginBottom={1} borderStyle="round" borderColor="yellow">
          <Text color="yellow">{theme.symbols.warning} {input.recommendationReason}</Text>
        </Box>
      )}

      {input.composerMode === "blocked" && (
        <Box key="blocked" paddingX={1} marginBottom={1} borderStyle="round" borderColor="yellow" flexDirection="column">
          <Text color="yellow">{theme.symbols.warning} Session blocked: manual recovery required.</Text>
          {input.blockingReason?.message ? <Text>{input.blockingReason.message}</Text> : null}
          <Text color={theme.colors.dim}>Inspect the workspace state before continuing.</Text>
        </Box>
      )}

      {/* Input Region */}
      <Box key="composer" borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor="gray" paddingTop={1}>
        <Composer mode={input.composerMode} onSubmit={input.onSubmit} />
      </Box>

      {/* Status Footer */}
      <StatusBar key="statusbar"
        modelName={input.modelName}
        thinkingLevel={input.thinkingLevel}
        workspaceRoot={input.workspaceRoot ?? ""}
      />
    </Box>
  );
}
