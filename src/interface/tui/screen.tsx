import React from "react";
import { Box, Text } from "ink";
import { AnswerPane } from "./components/answer-pane";
import { ApprovalPanel, type ApprovalSummary } from "./components/approval-panel";
import { Composer } from "./components/composer";
import { EventStream } from "./components/event-stream";
import { TaskPanel, type TaskSummary } from "./components/task-panel";
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
  onSubmit?: (text: string) => Promise<void> | void;
}) {
  return (
    <Box flexDirection="column">
      <Box paddingX={1} borderStyle="single" borderColor="cyan">
        <Text bold color="cyan">PROJECT: {input.projectId ?? "unknown"}</Text>
        <Text color="gray"> ({input.workspaceRoot ?? "unknown"})</Text>
      </Box>
      <Composer mode={input.composerMode} onSubmit={input.onSubmit} />
      <Box>
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
    </Box>
  );
}
