import React from "react";
import { Box, Text, useInput } from "ink";
import { useState } from "react";

export function Composer(input: { onSubmit?: (text: string) => Promise<void> | void }) {
  const [value, setValue] = useState("");

  useInput(async (keyValue, key) => {
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
      <Text>Composer</Text>
      <Text>{value.length > 0 ? value : "Describe the task"}</Text>
    </Box>
  );
}
