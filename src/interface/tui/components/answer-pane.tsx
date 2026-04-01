import React from "react";
import { Box, Text } from "ink";

export function AnswerPane(input: {
  summary: string;
  changes: Array<{ path: string; additions: number; deletions: number }>;
  verification: string[];
}) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>Answer</Text>
      <Text>{input.summary}</Text>
      {input.changes.map((change) => (
        <Text key={change.path}>
          {change.path} +{change.additions} -{change.deletions}
        </Text>
      ))}
      {input.verification.map((line) => (
        <Text key={line}>{line}</Text>
      ))}
    </Box>
  );
}
