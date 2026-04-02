import { afterEach, describe, expect, test } from "bun:test";
import { resolveConfig } from "../../src/shared/config";

const originalEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
};

afterEach(() => {
  process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
  process.env.OPENAI_BASE_URL = originalEnv.OPENAI_BASE_URL;
  process.env.OPENAI_MODEL = originalEnv.OPENAI_MODEL;
});

describe("resolveConfig", () => {
  test("reads OpenAI-style model variables from the environment", () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://example.invalid/v1";
    process.env.OPENAI_MODEL = "kimi-k2.5";

    const config = resolveConfig({
      workspaceRoot: "/tmp/config-workspace",
      dataDir: ":memory:",
    });

    expect(config.model.apiKey).toBe("test-key");
    expect(config.model.baseURL).toBe("https://example.invalid/v1");
    expect(config.model.name).toBe("kimi-k2.5");
  });
});
