import React from "react";
import { Box, Text } from "ink";
import type { RuntimeSessionState } from "../runtime/runtime-session";

export type AgentRunSummary = RuntimeSessionState["agentRuns"][number];

/** AgentRunPanel：列出当前活跃的内部 AgentRun 生命周期实例。 */
export function AgentRunPanel(input: { agentRuns: AgentRunSummary[] }) {
  if (input.agentRuns.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {input.agentRuns.map((agentRun) => (
        <Box key={agentRun.agentRunId} gap={1}>
          <Text color="cyan">agent run</Text>
          <Text color="gray">
            {agentRun.roleKind}:{agentRun.roleId}
            {` [${agentRun.status}]`}
          </Text>
          <Text>{agentRun.goalSummary}</Text>
        </Box>
      ))}
    </Box>
  );
}
