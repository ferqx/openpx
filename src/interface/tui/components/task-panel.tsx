import React from "react";
import { Box, Text } from "ink";

export type TaskSummary = {
  id: string;
  title: string;
  status: string;
};

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
        <Box key={task.id} gap={1}>
          {getStatusIndicator(task.status)}
          <Text>{task.title}</Text>
        </Box>
      ))}
    </Box>
  );
}
