import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

    expect(resolved.user.autoCompact).toBe(true);
    expect(resolved.project).toEqual({});
    expect(resolved.projectLocal).toEqual({});
    expect(resolved.effective.promptSuggestions).toBe(true);
    expect(resolved.sources.promptSuggestions).toBe("default");
    expect(resolved.paths.user).toBe(join(homeDir, ".openpx", "openpx.jsonc"));
    expect(resolved.paths.project).toBe(join(workspaceRoot, ".openpx", "openpx.jsonc"));
    expect(resolved.paths.projectLocal).toBe(join(workspaceRoot, ".openpx", "settings.local.jsonc"));
  });

  test("resolves effective values from project-local > project > user", () => {
    const resolved = resolveSettingsConfig({
      user: {
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
      },
      projectLocal: {
        verboseOutput: true,
        autoCompact: false,
      },
    });

    expect(resolved.effective.autoCompact).toBe(false);
    expect(resolved.effective.verboseOutput).toBe(true);
    expect(resolved.effective.showTips).toBe(true);
    expect(resolved.sources.autoCompact).toBe("project-local");
    expect(resolved.sources.verboseOutput).toBe("project-local");
    expect(resolved.sources.showTips).toBe("user");
  });

  test("persists user and project-local config into the new jsonc paths", async () => {
    const homeDir = await createTempDir("openpx-home-");
    const workspaceRoot = await createTempDir("openpx-workspace-");
    const store = createSettingsConfigStore({ homeDir, workspaceRoot });

    await store.writeUser({
      autoCompact: false,
      terminalProgressBar: false,
    });
    await store.writeProjectLocal({
      promptSuggestions: false,
    });

    const resolved = await store.readResolved();
    const userContent = await readFile(join(homeDir, ".openpx", "openpx.jsonc"), "utf8");
    const projectLocalContent = await readFile(join(workspaceRoot, ".openpx", "settings.local.jsonc"), "utf8");

    expect(resolved.user.autoCompact).toBe(false);
    expect(resolved.user.terminalProgressBar).toBe(false);
    expect(resolved.projectLocal.promptSuggestions).toBe(false);
    expect(resolved.effective.promptSuggestions).toBe(false);
    expect(resolved.sources.promptSuggestions).toBe("project-local");
    expect(resolved.sources.autoCompact).toBe("user");
    expect(userContent).not.toContain("\"$schema\"");
    expect(projectLocalContent).not.toContain("\"$schema\"");
  });

  test("refuses to overwrite an invalid current config file", async () => {
    const homeDir = await createTempDir("openpx-home-");
    const workspaceRoot = await createTempDir("openpx-workspace-");
    const configPath = join(homeDir, ".openpx", "openpx.jsonc");
    const store = createSettingsConfigStore({ homeDir, workspaceRoot });

    await mkdir(join(homeDir, ".openpx"), { recursive: true });
    await writeFile(configPath, `{
      "provider": {
        "openai": {
          "baseURL": "https://api.openai.com/v1",
          "apiKey": "sk-openpx-test"
        }
      },
      "model": {
        "default": {
          "provider": "openai",
          "name": 42
        }
      }
    }\n`, "utf8");

    await expect(
      store.writeUser({
        showTips: false,
      }),
    ).rejects.toThrow("cannot update settings because the current config file is invalid");

    const content = await readFile(configPath, "utf8");
    expect(content).toContain("\"name\": 42");
    expect(content).not.toContain("\"showTips\": false");
  });
});
