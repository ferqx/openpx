import React from "react";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { theme } from "../theme";

export function Composer(input: { 
  onSubmit?: (text: string) => Promise<void> | void;
  prompt?: string;
  mode?: "input" | "confirm" | "blocked";
}) {
  const [value, setValue] = useState("");
  const mode = input.mode ?? "input";

  useInput(async (keyValue, key) => {
    if (mode === "blocked") {
      return;
    }

    if (mode === "confirm") {
      if (keyValue.toLowerCase() === "y" || key.return) {
        await input.onSubmit?.("yes");
      } else if (keyValue.toLowerCase() === "n" || key.escape) {
        await input.onSubmit?.("no");
      }
      return;
    }

    if (key.return) {
      if (value.trim()) {
        await input.onSubmit?.(value);
        setValue("");
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue((current) => current.slice(0, -1));
      return;
    }

    if (key.ctrl || key.meta || key.escape || key.tab) {
      return;
    }

    setValue((current) => current + keyValue);
  });

  if (mode === "confirm") {
    return (
      <Box paddingX={1}>
        <Text color={theme.colors.user} bold>{theme.symbols.prompt} Confirm work? </Text>
        <Text color="yellow">[Y/n]</Text>
      </Box>
    );
  }

  if (mode === "blocked") {
    return (
      <Box paddingX={1}>
        <Text color="yellow" bold>{theme.symbols.warning} Input disabled for this thread</Text>
      </Box>
    );
  }

  return (
    <Box paddingX={1} gap={1}>
      <Text color={theme.colors.user} bold>{theme.symbols.prompt}</Text>
      <Box flexGrow={1}>
        {value.length > 0 ? (
          <Text>{value}</Text>
        ) : (
          <Text color={theme.colors.dim}>Describe the task or ask a question...</Text>
        )}
      </Box>
    </Box>
  );
}
