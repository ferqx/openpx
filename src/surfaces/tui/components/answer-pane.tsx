import React from "react";
import { Box, Text } from "ink";

/** AnswerPane：展示最终摘要、改动统计与验证结果 */
export function AnswerPane(input: {
  summary: string;
  changes: Array<{ path: string; additions: number; deletions: number }>;
  verification: string[];
  revision?: number;
  updatedAt?: string;
}) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} minHeight={5}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">RESULTS</Text>
        {input.revision ? <Text color="gray">v{input.revision}</Text> : null}
      </Box>
      
      <Box marginTop={1} marginBottom={1}>
        <Text color="white">{input.summary}</Text>
      </Box>

      {input.changes.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>MODIFICATIONS:</Text>
          {input.changes.map((change) => (
            <Box key={change.path} gap={1}>
              <Text color="gray">└</Text>
              <Text>{change.path}</Text>
              <Text color="green">+{change.additions}</Text>
              <Text color="red">-{change.deletions}</Text>
            </Box>
          ))}
        </Box>
      )}

      {input.verification.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>VERIFICATION:</Text>
          {input.verification.map((line, i) => (
            <Text key={i} color="blue">› {line}</Text>
          ))}
        </Box>
      )}

      {input.updatedAt && (
        <Box marginTop={1} justifyContent="flex-end">
          <Text dimColor>Last updated: {new Date(input.updatedAt).toLocaleTimeString()}</Text>
        </Box>
      )}
    </Box>
  );
}
