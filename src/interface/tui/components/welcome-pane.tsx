import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

const SUGGESTIONS = [
  "Plan a refactor for this repo",
  "Find the bug causing this failure",
  "Summarize the current workspace",
  "Implement a small feature safely",
];

export function WelcomePane(input: {
  workspaceRoot?: string;
  projectId?: string;
  viewportWidth?: number;
}) {
  const contentWidth = Math.min(72, Math.max(52, (input.viewportWidth ?? 80) - 8));

  return (
    <Box flexDirection="column" justifyContent="flex-start" paddingLeft={theme.spacing.indent} paddingTop={1}>
      <Box flexDirection="column" width={contentWidth}>
        <Box marginBottom={1}>
          <Text color={theme.colors.agent}>How can openpx help?</Text>
        </Box>
        <Box marginBottom={2}>
          <Text color={theme.colors.dim}>Ask openpx to plan, debug, or implement work in this workspace.</Text>
        </Box>
        <Box flexDirection="column">
          {SUGGESTIONS.map((suggestion) => (
            <Box key={suggestion} marginBottom={1}>
              <Text color={theme.colors.dim}>"{suggestion}"</Text>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
