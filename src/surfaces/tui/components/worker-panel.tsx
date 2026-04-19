import React from "react";
import { Box, Text } from "ink";
import type { RuntimeSessionState } from "../runtime/runtime-session";

/** WorkerPanel 使用的 worker 摘要类型 */
export type WorkerSummary = RuntimeSessionState["workers"][number];

/** AgentRunPanel：列出当前活跃的内部 AgentRun 生命周期实例。 */
export function AgentRunPanel(input: { workers: WorkerSummary[] }) {
  if (input.workers.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {input.workers.map((worker) => (
        <Box key={worker.workerId} gap={1}>
          <Text color="cyan">agent run</Text>
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

/** 兼容旧导出名，避免一次性改动全部调用点。 */
export const WorkerPanel = AgentRunPanel;
