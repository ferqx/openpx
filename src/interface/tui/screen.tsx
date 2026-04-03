import React from "react";
import { Box, Text } from "ink";
import { AnswerPane } from "./components/answer-pane";
import { ApprovalPanel, type ApprovalSummary } from "./components/approval-panel";
import { Composer } from "./components/composer";
import { EventStream } from "./components/event-stream";
import { TaskPanel, type TaskSummary } from "./components/task-panel";
import { StatusBar } from "./components/status-bar";
import type { TuiKernelEvent } from "./hooks/use-kernel";

export function Screen(input: {
  events: TuiKernelEvent[];
  tasks: TaskSummary[];
  approvals: ApprovalSummary[];
  answer: {
    summary: string;
    changes: Array<{ path: string; additions: number; deletions: number }>;
    verification: string[];
  };
  composerMode?: "input" | "confirm";
  workspaceRoot?: string;
  projectId?: string;
  threadId?: string;
  modelStatus?: string;
  runtimeStatus?: string;
  recommendationReason?: string;
  onSubmit?: (text: string) => Promise<void> | void;
}) {
  return (
    <Box flexDirection="column" height="100%">
      <Box paddingX={1} borderStyle="single" borderColor="cyan">
        <Text bold color="cyan">PROJECT: {input.projectId ?? "unknown"}</Text>
        <Text color="gray"> ({input.workspaceRoot ?? "unknown"})</Text>
      </Box>
      {input.composerMode === "confirm" && input.recommendationReason && (
        <Box paddingX={1} marginBottom={0}>
          <Text color="yellow">⚠ {input.recommendationReason}</Text>
        </Box>
      )}
      <Composer mode={input.composerMode} onSubmit={input.onSubmit} />
      <Box flexGrow={1}>
        <Box flexDirection="column" width="50%">
          <EventStream events={input.events} />
          <TaskPanel tasks={input.tasks} />
        </Box>
        <Box flexDirection="column" width="50%">
          <ApprovalPanel approvals={input.approvals} />
          <AnswerPane
            summary={input.answer.summary}
            changes={input.answer.changes}
            verification={input.answer.verification}
          />
        </Box>
      </Box>
      <StatusBar 
        projectId={input.projectId ?? "unknown"} 
        threadId={input.threadId ?? "none"}
        modelStatus={input.modelStatus ?? "idle"}
        runtimeStatus={input.runtimeStatus ?? "disconnected"}
      />
    </Box>
  );
}
