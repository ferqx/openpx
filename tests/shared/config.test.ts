import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveConfig } from "../../src/shared/config";

const originalEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENPX_THINKING: process.env.OPENPX_THINKING,
  OPENPX_DATA_DIR: process.env.OPENPX_DATA_DIR,
  OPENWENPX_DATA_DIR: process.env.OPENWENPX_DATA_DIR,
};

const tempDirs: string[] = [];

async function createTempDir(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
  process.env.OPENAI_BASE_URL = originalEnv.OPENAI_BASE_URL;
  process.env.OPENAI_MODEL = originalEnv.OPENAI_MODEL;
  process.env.OPENPX_THINKING = originalEnv.OPENPX_THINKING;
  process.env.OPENPX_DATA_DIR = originalEnv.OPENPX_DATA_DIR;
  process.env.OPENWENPX_DATA_DIR = originalEnv.OPENWENPX_DATA_DIR;
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("resolveConfig", () => {
  test("没有配置文件时不会再隐式生成 openai 默认模型", async () => {
    const homeDir = await createTempDir("openpx-home-");
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://example.invalid/v1";
    process.env.OPENAI_MODEL = "kimi-k2.5";
    process.env.OPENPX_THINKING = "medium";

    expect(() =>
      resolveConfig({
        workspaceRoot: "/tmp/config-workspace",
        dataDir: ":memory:",
        homeDir,
      }),
    ).toThrow("model.default is required");
  });

  test("从顶层 model 槽位解析跨 provider 的默认模型和小模型", async () => {
    const homeDir = await createTempDir("openpx-home-");
    const workspaceRoot = await createTempDir("openpx-workspace-");

    await mkdir(join(homeDir, ".openpx"), { recursive: true });
    await writeFile(join(homeDir, ".openpx", "openpx.jsonc"), `{
      "provider": {
        "openai": {
          "baseURL": "https://api.openai.com/v1",
          "apiKey": "file-openai-key"
        },
        "groq": {
          "baseURL": "https://api.groq.com/openai/v1",
          "apiKey": "groq-file-key"
        }
      },
      "model": {
        "default": {
          "provider": "openai",
          "name": "gpt-file"
        },
        "small": {
          "provider": "groq",
          "name": "llama-file-mini"
        }
      }
    }\n`, "utf8");

    process.env.OPENAI_API_KEY = "openai-key";
    process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
    process.env.OPENAI_MODEL = "env-should-not-win";

    const config = resolveConfig({
      workspaceRoot,
      dataDir: ":memory:",
      homeDir,
    });

    expect(config.model.default.provider.profile.providerId).toBe("openai");
    expect(config.model.default.provider.profile.baseURL).toBe("https://api.openai.com/v1");
    expect(config.model.default.name).toBe("gpt-file");
    expect(config.model.default.provider.apiKey).toBe("file-openai-key");
    expect(config.model.small.provider.profile.providerId).toBe("groq");
    expect(config.model.small.name).toBe("llama-file-mini");
    expect(config.model.small.provider.apiKey).toBe("groq-file-key");
  });

  test("未配置 small 槽位时统一回落到默认模型", async () => {
    const homeDir = await createTempDir("openpx-home-");
    const workspaceRoot = await createTempDir("openpx-workspace-");

    await mkdir(join(homeDir, ".openpx"), { recursive: true });
    await writeFile(join(homeDir, ".openpx", "openpx.jsonc"), `{
      "provider": {
        "openai": {
          "baseURL": "https://api.openai.com/v1",
          "apiKey": "file-openai-key"
        }
      },
      "model": {
        "default": {
          "provider": "openai",
          "name": "gpt-file"
        }
      }
    }\n`, "utf8");

    const config = resolveConfig({
      workspaceRoot,
      dataDir: ":memory:",
      homeDir,
    });

    expect(config.model.default.provider.profile.providerId).toBe("openai");
    expect(config.model.default.name).toBe("gpt-file");
    expect(config.model.small.provider.profile.providerId).toBe("openai");
    expect(config.model.small.name).toBe("gpt-file");
    expect(config.model.small.provider.apiKey).toBe("file-openai-key");
  });

  test("allowMissingModel 只允许缺失 default，不会吞掉显式写坏的 small 槽位", async () => {
    const homeDir = await createTempDir("openpx-home-");
    const workspaceRoot = await createTempDir("openpx-workspace-");

    await mkdir(join(homeDir, ".openpx"), { recursive: true });
    await writeFile(join(homeDir, ".openpx", "openpx.jsonc"), `{
      "provider": {
        "openai": {
          "baseURL": "https://api.openai.com/v1",
          "apiKey": "file-openai-key"
        }
      },
      "model": {
        "default": {
          "provider": "openai",
          "name": "gpt-file"
        },
        "small": {
          "provider": "missing",
          "name": "gpt-file-mini"
        }
      }
    }\n`, "utf8");

    expect(() =>
      resolveConfig({
        workspaceRoot,
        dataDir: ":memory:",
        homeDir,
        allowMissingModel: true,
      }),
    ).toThrow("model.small references unknown provider: missing");
  });

  test("prefers OPENPX_DATA_DIR while remaining compatible with OPENWENPX_DATA_DIR", () => {
    process.env.OPENPX_DATA_DIR = "/tmp/openpx/agent.sqlite";
    process.env.OPENWENPX_DATA_DIR = "/tmp/openwenpx/agent.sqlite";

    const preferred = process.env.OPENPX_DATA_DIR ?? process.env.OPENWENPX_DATA_DIR ?? ":memory:";
    expect(preferred).toBe("/tmp/openpx/agent.sqlite");

    delete process.env.OPENPX_DATA_DIR;
    const fallback = process.env.OPENPX_DATA_DIR ?? process.env.OPENWENPX_DATA_DIR ?? ":memory:";
    expect(fallback).toBe("/tmp/openwenpx/agent.sqlite");
  });

  test("uses file-backed provider config and inline apiKey when any config layer exists", async () => {
    const homeDir = await createTempDir("openpx-home-");
    const workspaceRoot = await createTempDir("openpx-workspace-");

    await mkdir(join(homeDir, ".openpx"), { recursive: true });
    await writeFile(join(homeDir, ".openpx", "openpx.jsonc"), `{
      "provider": {
        "openai": {
          "baseURL": "https://api.openai.com/v1",
          "apiKey": "file-secret"
        }
      },
      "model": {
        "default": {
          "provider": "openai",
          "name": "gpt-file"
        },
        "small": {
          "provider": "openai",
          "name": "gpt-file-mini"
        }
      },
      "runtime": {
        "timeoutMs": 45000,
        "maxRetries": 3,
        "enableTelemetry": false,
        "enableCostTracking": false
      }
    }\n`, "utf8");

    process.env.OPENAI_API_KEY = "env-secret-should-not-win";
    process.env.OPENAI_MODEL = "env-should-not-win";
    process.env.OPENPX_THINKING = "medium";

    const config = resolveConfig({
      workspaceRoot,
      dataDir: ":memory:",
      homeDir,
    });

    expect(config.model.default.name).toBe("gpt-file");
    expect(config.model.small.name).toBe("gpt-file-mini");
    expect(config.model.default.provider.apiKey).toBe("file-secret");
    expect(config.model.retryPolicy.maxRetries).toBe(3);
    expect(config.model.retryPolicy.operationTimeoutMs.plan).toBe(45_000);
    expect(config.model.enableTelemetry).toBe(false);
    expect(config.model.enableCostTracking).toBe(false);
    expect(config.model.thinking).toBeUndefined();
  });
});
