import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createSettingsConfigStore,
  resolveSettingsConfig,
} from "../../src/surfaces/tui/settings/config-store";

const tempDirs: string[] = [];

async function createTempDir(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("settings config", () => {
  test("uses built-in defaults when no config files exist", async () => {
    const homeDir = await createTempDir("openpx-home-");
    const workspaceRoot = await createTempDir("openpx-workspace-");
    const store = createSettingsConfigStore({ homeDir, workspaceRoot });

    const resolved = await store.readResolved();

    expect(resolved.global.autoCompact).toBe(true);
    expect(resolved.project).toEqual({});
    expect(resolved.effective.promptSuggestions).toBe(true);
    expect(resolved.sources.promptSuggestions).toBe("default");
    expect(resolved.paths.global).toBe(join(homeDir, ".openpx", "config.json"));
    expect(resolved.paths.project).toBe(join(workspaceRoot, ".openpx", "config.json"));
  });

  test("resolves effective values from project overrides above global defaults", () => {
    const resolved = resolveSettingsConfig({
      global: {
        autoCompact: false,
        showTips: true,
        reduceMotion: false,
        thinkingMode: true,
        fastMode: false,
        promptSuggestions: true,
        rewindCode: true,
        verboseOutput: false,
        terminalProgressBar: true,
      },
      project: {
        autoCompact: true,
        verboseOutput: true,
      },
    });

    expect(resolved.effective.autoCompact).toBe(true);
    expect(resolved.effective.verboseOutput).toBe(true);
    expect(resolved.effective.showTips).toBe(true);
    expect(resolved.sources.autoCompact).toBe("project");
    expect(resolved.sources.verboseOutput).toBe("project");
    expect(resolved.sources.showTips).toBe("global");
  });

  test("persists global and project config as separate json files", async () => {
    const homeDir = await createTempDir("openpx-home-");
    const workspaceRoot = await createTempDir("openpx-workspace-");
    const store = createSettingsConfigStore({ homeDir, workspaceRoot });

    await store.writeGlobal({
      autoCompact: false,
      terminalProgressBar: false,
    });
    await store.writeProject({
      promptSuggestions: false,
    });

    const resolved = await store.readResolved();

    expect(resolved.global.autoCompact).toBe(false);
    expect(resolved.global.terminalProgressBar).toBe(false);
    expect(resolved.project.promptSuggestions).toBe(false);
    expect(resolved.effective.promptSuggestions).toBe(false);
    expect(resolved.sources.promptSuggestions).toBe("project");
    expect(resolved.sources.autoCompact).toBe("global");
  });
});
