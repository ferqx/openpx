import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { Composer } from "../../src/surfaces/tui/components/composer";

describe("Composer", () => {
  const tick = (delayMs = 0) => new Promise((resolve) => setTimeout(resolve, delayMs));

  async function typeAndSubmit(stdin: { write: (input: string) => void }, text: string) {
    for (const char of text) {
      stdin.write(char);
      await tick();
    }
    await tick();
    stdin.write("\r");
    await tick();
  }

  test("renders as a flat input bar instead of a bordered card", async () => {
    const { lastFrame } = render(<Composer isActive={false} />);

    const frame = lastFrame() ?? "";

    expect(frame).toContain("Ask openpx... Press / for commands");
    expect(frame).not.toContain("╭");
    expect(frame).not.toContain("╰");
    expect(frame).not.toContain("│");
  });

  test("blocked mode keeps input editable and submit-capable", async () => {
    let submitted: string | undefined;
    const { lastFrame, stdin } = render(
      <Composer
        mode="blocked"
        onSubmit={(text) => {
          submitted = text;
        }}
      />,
    );

    expect(lastFrame() ?? "").toContain("Ask openpx... Press / for commands");
    expect(lastFrame() ?? "").not.toContain("Input disabled");

    await typeAndSubmit(stdin, "继续处理当前任务");

    expect(submitted).toBe("继续处理当前任务");
  });
});
