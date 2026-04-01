import React from "react";
import { Box } from "ink";
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
  onSubmit?: (text: string) => Promise<void> | void;
}) {
  return (
    <Box flexDirection="column">
      <Composer onSubmit={input.onSubmit} />
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
