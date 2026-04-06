import React from "react";
import { Box, Text } from "ink";
import type { SlashCommandDefinition } from "../commands";
import { theme } from "../theme";

export function CommandSuggestions(input: {
  suggestions: SlashCommandDefinition[];
  selectedIndex: number;
}) {
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      paddingX={1}
      borderStyle="round"
      borderColor={theme.colors.dim}
    >
      <Text color={theme.colors.dim}>commands</Text>
      {input.suggestions.map((suggestion, index) => {
        const selected = index === input.selectedIndex;
        return (
          <Box key={suggestion.command} gap={1}>
            <Text color={selected ? theme.colors.primary : theme.colors.dim}>
              {selected ? "❯" : " "}
            </Text>
            <Text color={selected ? theme.colors.primary : undefined}>
              {suggestion.command}
            </Text>
            <Text color={theme.colors.dim}>{suggestion.description}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
