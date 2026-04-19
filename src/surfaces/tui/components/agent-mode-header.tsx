import React from "react";
import { Box, Text } from "ink";
import { BUILD_AGENT_SPEC, type PrimaryAgentId } from "../../../control/agents/agent-spec";
import type { ThreadMode } from "../../../control/agents/thread-mode";
import { theme } from "../theme";

function formatPrimaryAgent(agent: PrimaryAgentId): string {
  if (agent === BUILD_AGENT_SPEC.id) {
    return BUILD_AGENT_SPEC.label;
  }
  return agent;
}

/** AgentModeHeader：明确展示产品层主代理与 thread mode。 */
export function AgentModeHeader(input: {
  primaryAgent: PrimaryAgentId;
  threadMode: ThreadMode;
}) {
  return (
    <Box gap={2} marginBottom={1}>
      <Text color={theme.colors.dim}>{`Agent: ${formatPrimaryAgent(input.primaryAgent)}`}</Text>
      <Text color={theme.colors.dim}>{`Mode: ${input.threadMode}`}</Text>
    </Box>
  );
}
