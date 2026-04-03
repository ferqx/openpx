import React from "react";
import { Box, Text, useInput } from "ink";
import { useState } from "react";

export function Composer(input: { 
  onSubmit?: (text: string) => Promise<void> | void;
  prompt?: string;
  mode?: "input" | "confirm";
}) {
  const [value, setValue] = useState("");
  const mode = input.mode ?? "input";

  useInput(async (keyValue, key) => {
    if (mode === "confirm") {
      if (keyValue.toLowerCase() === "y" || key.return) {
        await input.onSubmit?.("yes");
      } else if (keyValue.toLowerCase() === "n" || key.escape) {
        await input.onSubmit?.("no");
      }
      return;
    }

    if (key.return) {
      await input.onSubmit?.(value);
      setValue("");
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

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>{input.prompt ?? (mode === "confirm" ? "Confirm?" : "Composer")}</Text>
      <Box>
        {mode === "confirm" ? (
          <Text color="yellow">Agent team ready. Start? [Y/n]</Text>
        ) : (
          <Text>{value.length > 0 ? value : "Describe the task"}</Text>
        )}
      </Box>
    </Box>
  );
}
