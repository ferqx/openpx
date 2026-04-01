import React from "react";
import { Box, Text } from "ink";

export type TaskSummary = {
  id: string;
  title: string;
  status: string;
};

export function TaskPanel(input: { tasks: TaskSummary[] }) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>Tasks</Text>
      {input.tasks.length === 0 ? <Text color="gray">No active tasks</Text> : null}
      {input.tasks.map((task) => (
        <Text key={task.id}>
          {task.title} [{task.status}]
        </Text>
      ))}
    </Box>
  );
}
