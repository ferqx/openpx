import React from "react";
import { Box, Text } from "ink";
import type { TuiKernelEvent } from "../hooks/use-kernel";

export function EventStream(input: { events: TuiKernelEvent[] }) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>Events</Text>
      {input.events.length === 0 ? <Text color="gray">Waiting for events</Text> : null}
      {input.events.map((event, index) => (
        <Text key={`${event.type}-${index}`}>{event.type}</Text>
      ))}
    </Box>
  );
}
