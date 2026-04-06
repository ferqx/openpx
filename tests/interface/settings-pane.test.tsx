import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { SettingsPane } from "../../src/interface/tui/components/settings-pane";
import type { ResolvedSettingsConfig } from "../../src/interface/tui/settings/config-resolver";

const resolvedConfig: ResolvedSettingsConfig = {
  global: {
    autoCompact: true,
    showTips: true,
    reduceMotion: false,
    thinkingMode: true,
    fastMode: false,
    promptSuggestions: true,
    rewindCode: true,
    verboseOutput: false,
    terminalProgressBar: true,
  },
  project: {},
  effective: {
    autoCompact: true,
    showTips: true,
    reduceMotion: false,
    thinkingMode: true,
    fastMode: false,
    promptSuggestions: true,
    rewindCode: true,
    verboseOutput: false,
    terminalProgressBar: true,
  },
  sources: {
    autoCompact: "default",
    showTips: "default",
    reduceMotion: "default",
    thinkingMode: "default",
    fastMode: "default",
    promptSuggestions: "default",
    rewindCode: "default",
    verboseOutput: "default",
    terminalProgressBar: "default",
  },
};

const tick = (delayMs = 0) => new Promise((resolve) => setTimeout(resolve, delayMs));

describe("SettingsPane", () => {
  test("toggles and saves global config from keyboard input", async () => {
    let saved: Record<string, boolean> | undefined;
    const { lastFrame, stdin } = render(
      <SettingsPane
        config={resolvedConfig}
        onClose={() => undefined}
        onSave={async (_scope, config) => {
          saved = config;
        }}
      />,
    );

    await tick();
    stdin.write(" ");
    await tick();
    stdin.write("\r");
    await tick();

    expect(lastFrame()).toContain("Auto-compact");
    expect(saved?.autoCompact).toBe(false);
  });

  test("switches to project scope and saves project overrides", async () => {
    let savedScope: string | undefined;
    let saved: Record<string, boolean> | undefined;
    const { lastFrame, stdin } = render(
      <SettingsPane
        config={resolvedConfig}
        onClose={() => undefined}
        onSave={async (scope, config) => {
          savedScope = scope;
          saved = config;
        }}
      />,
    );

    await tick();
    stdin.write("p");
    await tick();
    stdin.write(" ");
    await tick();
    stdin.write("\r");
    await tick();

    expect(lastFrame()).toContain("Scope: Project");
    expect(savedScope).toBe("project");
    expect(saved?.autoCompact).toBe(false);
  });

  test("shows runtime status facts and usage help across tabs", async () => {
    const { lastFrame, stdin } = render(
      <SettingsPane
        config={resolvedConfig}
        modelName="gpt-5.4"
        thinkingLevel="high"
        workspaceRoot="/tmp/workspace"
        threadId="thread-42"
        stage="planning"
        onClose={() => undefined}
        onSave={() => undefined}
      />,
    );

    await tick();
    stdin.write("\t");
    await tick();
    expect(lastFrame()).toContain("/plan <prompt>");
    expect(lastFrame()).toContain("Esc closes settings");
    expect(lastFrame()).toContain("Space toggles the selected config value");

    stdin.write("\t");
    await tick();
    expect(lastFrame()).toContain("Model: gpt-5.4");
    expect(lastFrame()).toContain("Stage: planning");
    expect(lastFrame()).toContain("/tmp/workspace");
  });
});
