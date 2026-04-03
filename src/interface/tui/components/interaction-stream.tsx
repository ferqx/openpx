import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { TuiKernelEvent } from "../hooks/use-kernel";
import type { TaskSummary } from "./task-panel";
import type { ApprovalSummary } from "./approval-panel";
import { theme } from "../theme";

export interface InteractionStreamProps {
  events: TuiKernelEvent[];
  tasks: TaskSummary[];
  approvals: ApprovalSummary[];
  answer: {
    summary: string;
    changes: Array<{ path: string; additions: number; deletions: number }>;
    verification: string[];
  };
  modelStatus?: string;
}

export function InteractionStream({ events, tasks, approvals, answer, modelStatus }: InteractionStreamProps) {
  const [elapsed, setElapsed] = useState(0);
  const AnySpinner = Spinner as any;

  useEffect(() => {
    let timer: Timer | undefined;
    if (modelStatus === "thinking" || modelStatus === "responding") {
      timer = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      setElapsed(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [modelStatus]);

  // Filter events to show meaningful activity
  const filteredEvents = events.filter(e => 
    e.type === "task.created" || 
    e.type === "thread.started" ||
    e.type === "tool.executed" ||
    e.type === "answer.updated"
  );

  return (
    <Box flexDirection="column">
      {/* Interaction History */}
      <Box flexDirection="column" marginBottom={1}>
        {filteredEvents.map((event, index) => {
          switch (event.type) {
            case "thread.started":
              return (
                <Box key={index} marginBottom={1}>
                  <Text color={theme.colors.dim}>{theme.symbols.info} New session started.</Text>
                </Box>
              );
            case "tool.executed":
              const payload = event.payload as any;
              return (
                <Box key={index} marginLeft={theme.spacing.indent}>
                  <Text color={theme.colors.tool}>
                    {theme.symbols.step} Executing {payload.toolName}...
                  </Text>
                </Box>
              );
            case "answer.updated":
              return null; // Handled by current answer
            default:
              return (
                <Box key={index}>
                  <Text color={theme.colors.dim}>· {event.type}</Text>
                </Box>
              );
          }
        })}
      </Box>

      {/* Current Active Output */}
      {answer.summary && answer.summary !== "Awaiting answer" && (
        <Box flexDirection="column" paddingX={1} marginBottom={1}>
          <Text bold color={theme.colors.agent}>Agent:</Text>
          <Box paddingLeft={theme.spacing.indent}>
            <Text>{answer.summary}</Text>
          </Box>
          {answer.changes.length > 0 && (
            <Box flexDirection="column" marginTop={1} paddingLeft={theme.spacing.indent}>
              <Text bold color={theme.colors.dim}>Changes:</Text>
              {answer.changes.map((change, i) => (
                <Text key={i} color="gray">
                  {theme.symbols.arrowRight} {change.path} 
                  <Text color="green"> +{change.additions}</Text> 
                  <Text color="red"> -{change.deletions}</Text>
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Real-time Status / Thinking State */}
      {(modelStatus === "thinking" || modelStatus === "responding") && (
        <Box marginLeft={theme.spacing.indent} marginBottom={1} gap={1}>
          <Text color={theme.colors.primary}>
            <AnySpinner type="dots" />
          </Text>
          <Text color={theme.colors.dim}>
            {modelStatus === "thinking" ? "Thinking..." : "Responding..."}
            {elapsed > 0 && ` (${elapsed}s)`}
          </Text>
        </Box>
      )}

      {/* Active Tasks & Approvals */}
      <Box flexDirection="column">
        {tasks.filter(t => t.status === "running").map(task => (
          <Box key={task.id} marginLeft={theme.spacing.indent}>
            <Text color={theme.colors.primary}>
              <AnySpinner type="simpleDots" /> {task.title}...
            </Text>
          </Box>
        ))}
        {approvals.map(approval => (
          <Box key={approval.id} paddingX={1} borderStyle="round" borderColor="yellow" marginBottom={1}>
            <Text bold color="yellow">{theme.symbols.warning} Action Required: </Text>
            <Text>{approval.title}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
