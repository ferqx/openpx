import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme';

export function WelcomePane(input: {
  workspaceRoot?: string;
  projectId?: string;
  viewportWidth?: number;
}) {
  const contentWidth = Math.min(
    72,
    Math.max(52, (input.viewportWidth ?? 80) - 8)
  );

  return (
    <Box
      flexDirection="column"
      justifyContent="flex-start"
      paddingLeft={0}
      paddingTop={1}
    >
      <Box flexDirection="column" width={contentWidth}>
        <Box marginBottom={1}>
          <Text color={theme.colors.agent}>OpenPX</Text>
        </Box>
        <Box flexDirection="column"></Box>
      </Box>
    </Box>
  );
}
