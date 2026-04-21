import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { InteractionStream } from "../../src/surfaces/tui/components/interaction-stream";

describe("InteractionStream", () => {
  test("shows a history indicator when wrapped message lines exceed the viewport height", () => {
    const { lastFrame } = render(
      <InteractionStream
        messages={[
          {
            id: "msg-1",
            role: "user",
            content: "first question",
            timestamp: 1,
          },
          {
            id: "msg-2",
            role: "assistant",
            content: "first response ".repeat(10),
            timestamp: 2,
          },
          {
            id: "msg-3",
            role: "user",
            content: "second question",
            timestamp: 3,
          },
          {
            id: "msg-4",
            role: "assistant",
            content: "second response ".repeat(10),
            timestamp: 4,
          },
        ]}
        tasks={[]}
        approvals={[]}
        agentRuns={[]}
        viewportWidth={24}
        viewportHeight={8}
      />,
    );

    expect(lastFrame() ?? "").toContain("history ↑");
  });
});
