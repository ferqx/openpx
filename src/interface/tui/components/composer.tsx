import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

export function Composer(input: { onSubmit?: (text: string) => Promise<void> | void }) {
  const [value, setValue] = useState("");

  async function handleSubmit(text: string) {
    await input.onSubmit?.(text);
    setValue("");
  }

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>Composer</Text>
      <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} placeholder="Describe the task" />
    </Box>
  );
}
