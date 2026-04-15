import React from "react";
import { Box, Text } from "ink";
import type { RuntimeSessionState } from "../runtime/runtime-session";

/** TaskPanel 使用的任务摘要类型 */
export type TaskSummary = RuntimeSessionState["tasks"][number];

/** TaskPanel：列出当前任务及其状态 */
export function TaskPanel(input: { tasks: TaskSummary[] }) {
  const getStatusIndicator = (status: string) => {
    switch (status) {
      case "running":
        return <Text color="blue">●</Text>;
      case "completed":
        return <Text color="green">✔</Text>;
      case "failed":
        return <Text color="red">✖</Text>;
      case "blocked":
      case "waiting_approval":
        return <Text color="yellow">⏸</Text>;
      default:
        return <Text color="gray">○</Text>;
    }
  };

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>TASKS</Text>
      {input.tasks.length === 0 ? <Text color="gray">No active tasks</Text> : null}
      {input.tasks.map((task) => (
        <Box key={task.taskId} gap={1}>
          {getStatusIndicator(task.status)}
          <Text>{task.summary}</Text>
        </Box>
      ))}
    </Box>
  );
}
