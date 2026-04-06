import React from "react";
import { Box, Text } from "ink";
import type { TuiKernelEvent } from "../hooks/use-kernel";

export function EventStream(input: { events: TuiKernelEvent[] }) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>Events</Text>
      {input.events.length === 0 ? <Text color="gray">Waiting for events</Text> : null}
      {input.events.map((event, index) => {
        // 为每个事件生成唯一 key
        const eventId = (event as any).seq || 
                       (event as any).timestamp || 
                       (event as any).threadId || 
                       (event as any).taskId || 
                       `${event.type}-${index}`;
        return <Text key={eventId}>{event.type}</Text>;
      })}
    </Box>
  );
}
