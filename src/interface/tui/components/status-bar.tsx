import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

export interface StatusBarProps {
  projectId: string;
  threadId: string;
  modelStatus: string;
  runtimeStatus: string;
}

export function StatusBar({ projectId, threadId, modelStatus, runtimeStatus }: StatusBarProps) {
  const getModelColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "thinking":
        return theme.colors.primary;
      case "responding":
        return theme.colors.success;
      default:
        return theme.colors.dim;
    }
  };

  const getRuntimeColor = (status: string) => {
    return status === "connected" ? theme.colors.success : theme.colors.error;
  };

  return (
    <Box 
      width="100%" 
      borderStyle="single" 
      borderTop={true} borderBottom={false} borderLeft={false} borderRight={false}
      borderColor="gray" 
      paddingX={1}
      justifyContent="space-between"
    >
      <Box gap={2}>
        <Box>
          <Text color={theme.colors.dim}>PROJECT </Text>
          <Text color={theme.colors.primary}>{projectId || "none"}</Text>
        </Box>
        <Box>
          <Text color={theme.colors.dim}>THREAD </Text>
          <Text color={theme.colors.secondary}>{threadId || "none"}</Text>
        </Box>
      </Box>
      <Box gap={2}>
        <Box>
          <Text color={theme.colors.dim}>MODEL </Text>
          <Text color={getModelColor(modelStatus)}>{modelStatus.toUpperCase()}</Text>
        </Box>
        <Box>
          <Text color={theme.colors.dim}>RUNTIME </Text>
          <Text color={getRuntimeColor(runtimeStatus)}>{runtimeStatus.toUpperCase()}</Text>
        </Box>
      </Box>
    </Box>
  );
}
