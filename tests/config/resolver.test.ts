import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadAndResolveOpenPXConfig } from "../../src/config/resolver";

const tempDirs: string[] = [];

async function createTempDir(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("loadAndResolveOpenPXConfig", () => {
  test("只按用户和项目 .openpx 目录中的三层文件读取 JSONC 并发现 capability 目录", async () => {
    const homeDir = await createTempDir("openpx-home-");
    const workspaceRoot = await createTempDir("openpx-workspace-");

    await mkdir(join(homeDir, ".openpx", "skills"), { recursive: true });
    await mkdir(join(workspaceRoot, ".openpx", "agents"), { recursive: true });
    await writeFile(join(homeDir, ".openpx", "skills", "review.md"), "# review\n", "utf8");
    await writeFile(join(workspaceRoot, ".openpx", "agents", "coder.jsonc"), "{ }\n", "utf8");

    await mkdir(join(homeDir, ".openpx"), { recursive: true });
    await writeFile(join(homeDir, ".openpx", "openpx.jsonc"), `{
      // user
      "provider": {
        "openai": {
          "baseURL": "https://api.openai.com/v1",
          "apiKey": "sk-user-openai"
        }
      },
      "model": {
        "default": {
          "provider": "openai",
          "name": "gpt-user"
        },
        "small": {
          "provider": "openai",
          "name": "gpt-user-mini"
        }
      },
      "ui": {
        "tui": {
          "verboseOutput": true
        }
      }
    }\n`, "utf8");
    await mkdir(join(workspaceRoot, ".openpx"), { recursive: true });
    await writeFile(join(workspaceRoot, ".openpx", "openpx.jsonc"), `{
      "provider": {
        "groq": {
          "baseURL": "https://api.groq.com/openai/v1",
          "apiKey": "gsk-project-groq"
        }
      },
      "model": {
        "small": {
          "provider": "groq",
          "name": "llama-project-small"
        }
      },
      "runtime": {
        "thinkingLevel": "high"
      },
      "permission": {
        "defaultMode": "guarded"
      },
      "ui": {
        "tui": {
          "promptSuggestions": false
        }
      }
    }\n`, "utf8");
    await writeFile(join(workspaceRoot, ".openpx", "settings.local.jsonc"), `{
      "permission": {
        "defaultMode": "full_access"
      },
      "ui": {
        "tui": {
          "verboseOutput": false
        }
      }
    }\n`, "utf8");
    const resolved = loadAndResolveOpenPXConfig({
      workspaceRoot,
      homeDir,
      env: {},
    });

    expect(resolved.envFallback).toBe(false);
    expect(resolved.config.provider?.openai?.baseURL).toBe("https://api.openai.com/v1");
    expect(resolved.config.provider?.groq?.baseURL).toBe("https://api.groq.com/openai/v1");
    expect(resolved.config.model?.default?.name).toBe("gpt-user");
    expect(resolved.config.model?.small?.provider).toBe("groq");
    expect(resolved.config.model?.small?.name).toBe("llama-project-small");
    expect(resolved.config.runtime?.thinkingLevel).toBe("high");
    expect(resolved.config.permission?.defaultMode).toBe("full_access");
    expect(resolved.config.ui?.tui?.verboseOutput).toBe(false);
    expect(resolved.config.ui?.tui?.promptSuggestions).toBe(false);
    expect(resolved.config.ui?.tui?.autoCompact).toBe(true);
    expect(resolved.inventory.skills.some((path) => path.endsWith("/review.md"))).toBe(true);
    expect(resolved.inventory.agents.some((path) => path.endsWith("/coder.jsonc"))).toBe(true);
    expect(resolved.layers.filter((layer) => layer.exists)).toHaveLength(3);
  });

  test("没有配置文件时也不会读取 OPENAI 环境变量", async () => {
    const homeDir = await createTempDir("openpx-home-");
    const workspaceRoot = await createTempDir("openpx-workspace-");

    expect(() =>
      loadAndResolveOpenPXConfig({
        workspaceRoot,
        homeDir,
        env: {
          OPENAI_BASE_URL: "https://example.invalid/v1",
          OPENAI_MODEL: "kimi-k2.5",
          OPENAI_API_KEY: "secret",
          OPENPX_THINKING: "medium",
        },
      }),
    ).toThrow("model.default is required");
  });

  test("small 缺省或显式置空时，解析结果保留为缺省，交由运行时回落到 default", async () => {
    const homeDir = await createTempDir("openpx-home-");
    const workspaceRoot = await createTempDir("openpx-workspace-");

    await mkdir(join(homeDir, ".openpx"), { recursive: true });
    await writeFile(join(homeDir, ".openpx", "openpx.jsonc"), `{
      "provider": {
        "openai": {
          "baseURL": "https://api.openai.com/v1",
          "apiKey": "sk-user-openai"
        }
      },
      "model": {
        "default": {
          "provider": "openai",
          "name": "gpt-user"
        },
        "small": null
      }
    }\n`, "utf8");

    const resolved = loadAndResolveOpenPXConfig({
      workspaceRoot,
      homeDir,
      env: {},
    });

    expect(resolved.config.model?.default?.provider).toBe("openai");
    expect(resolved.config.model?.default?.name).toBe("gpt-user");
    expect(resolved.config.model?.small).toBeNull();
  });
});
