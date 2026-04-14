import React from "react";
import { Box, Text } from "ink";
import type { RuntimeSessionState } from "../runtime/runtime-session";

/** WorkerPanel 使用的 worker 摘要类型 */
export type WorkerSummary = RuntimeSessionState["workers"][number];

/** WorkerPanel：列出当前活跃 worker */
export function WorkerPanel(input: { workers: WorkerSummary[] }) {
  if (input.workers.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {input.workers.map((worker) => (
        <Box key={worker.workerId} gap={1}>
          <Text color="cyan">worker</Text>
          <Text color="gray">
            {worker.role}
            {` [${worker.status}]`}
          </Text>
          <Text>{worker.spawnReason}</Text>
        </Box>
      ))}
    </Box>
  );
}
