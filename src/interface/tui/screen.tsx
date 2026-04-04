import React from "react";
import { Box, Text } from "ink";
import { InteractionStream } from "./components/interaction-stream";
import { Composer } from "./components/composer";
import { StatusBar } from "./components/status-bar";
import { theme } from "./theme";
import type { TuiKernelEvent } from "./hooks/use-kernel";
import type { TaskSummary } from "./components/task-panel";
import type { ApprovalSummary } from "./components/approval-panel";

export function Screen(input: {
  events: TuiKernelEvent[];
  tasks: TaskSummary[];
  approvals: ApprovalSummary[];
  answer: {
    summary: string;
    changes: Array<{ path: string; additions: number; deletions: number }>;
    verification: string[];
  };
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
  recommendationReason?: string;
  narrativeSummary?: string;
  onSubmit?: (text: string) => Promise<void> | void;
}) {
  return (
    <Box flexDirection="column" height="100%" paddingX={1}>
      {/* Header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Box>
          <Text bold color={theme.colors.primary}>openpx</Text>
          <Text color={theme.colors.dim}> / </Text>
          <Text color={theme.colors.secondary}>{input.projectId ?? "unknown"}</Text>
        </Box>
        <Text color={theme.colors.dim}>{input.workspaceRoot ?? "unknown"}</Text>
      </Box>

      {input.narrativeSummary ? (
        <Box marginBottom={1}>
          <Text color={theme.colors.dim}>Thread:</Text>
          <Text> {input.narrativeSummary}</Text>
        </Box>
      ) : null}

      {/* Main Interaction Stream */}
      <Box flexGrow={1} flexDirection="column">
        <InteractionStream 
          events={input.events} 
          answer={input.answer}
          tasks={input.tasks}
          approvals={input.approvals}
          modelStatus={input.modelStatus}
        />
      </Box>

      {/* Recommendation Prompt */}
      {input.composerMode === "confirm" && input.recommendationReason && (
        <Box paddingX={1} marginBottom={1} borderStyle="round" borderColor="yellow">
          <Text color="yellow">{theme.symbols.warning} {input.recommendationReason}</Text>
        </Box>
      )}

      {input.composerMode === "blocked" && (
        <Box paddingX={1} marginBottom={1} borderStyle="round" borderColor="yellow" flexDirection="column">
          <Text color="yellow">{theme.symbols.warning} Session blocked: manual recovery required.</Text>
          {input.blockingReason?.message ? <Text>{input.blockingReason.message}</Text> : null}
          <Text color={theme.colors.dim}>Inspect the workspace state before continuing.</Text>
        </Box>
      )}

      {/* Input Region */}
      <Box borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor="gray" paddingTop={1}>
        <Composer mode={input.composerMode} onSubmit={input.onSubmit} />
      </Box>

      {/* Status Footer */}
      <StatusBar 
        projectId={input.projectId ?? "unknown"} 
        threadId={input.threadId ?? "none"}
        modelStatus={input.modelStatus ?? "idle"}
        runtimeStatus={input.runtimeStatus ?? "connected"}
      />
    </Box>
  );
}
