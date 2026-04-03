import React from "react";
import { Box, Text } from "ink";

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
        return "yellow";
      case "responding":
        return "green";
      default:
        return "gray";
    }
  };

  const getRuntimeColor = (status: string) => {
    return status === "connected" ? "green" : "red";
  };

  return (
    <Box 
      width="100%" 
      borderStyle="single" 
      borderColor="gray" 
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text bold>PRJ: </Text>
        <Text color="cyan">{projectId || "none"}</Text>
        <Text>  </Text>
        <Text bold>THD: </Text>
        <Text color="magenta">{threadId || "none"}</Text>
      </Box>
      <Box>
        <Text bold>MODEL: </Text>
        <Text color={getModelColor(modelStatus)}>{modelStatus.toUpperCase()}</Text>
        <Text>  </Text>
        <Text bold>RUNTIME: </Text>
        <Text color={getRuntimeColor(runtimeStatus)}>{runtimeStatus.toUpperCase()}</Text>
      </Box>
    </Box>
  );
}
