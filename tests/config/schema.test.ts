import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";
import {
  openPXConfigJsonSchema,
  openPXConfigSchema,
} from "../../src/config/schema";

describe("openPXConfigSchema", () => {
  test("接受扁平 provider 与顶层 model 的正式字段", () => {
    const parsed = openPXConfigSchema.parse({
      provider: {
        openai: {
          baseURL: "https://api.openai.com/v1",
          apiKey: "sk-openpx-test",
        },
        groq: {
          baseURL: "https://api.groq.com/openai/v1",
          apiKey: "gsk-openpx-test",
        },
      },
      model: {
        default: {
          provider: "openai",
          name: "gpt-5.4",
        },
        small: {
          provider: "groq",
          name: "llama-3.1-8b-instant",
        },
      },
      runtime: {
        thinkingLevel: "high",
        timeoutMs: 120_000,
      },
      permission: {
        defaultMode: "guarded",
      },
      ui: {
        tui: {
          autoCompact: true,
          verboseOutput: false,
        },
      },
    });

    expect(parsed.runtime?.thinkingLevel).toBe("high");
    expect(parsed.model?.default?.provider).toBe("openai");
    expect(parsed.model?.small?.name).toBe("llama-3.1-8b-instant");
    expect(parsed.ui?.tui?.autoCompact).toBe(true);
    expect(parsed.permission?.defaultMode).toBe("guarded");
  });

  test("拒绝非法的 runtime.thinkingLevel", () => {
    expect(() =>
      openPXConfigSchema.parse({
        runtime: {
          thinkingLevel: "ultra",
        },
      }),
    ).toThrow(ZodError);
  });

  test("允许 small 槽位省略，供运行时回落到 default", () => {
    const parsed = openPXConfigSchema.parse({
      provider: {
        openai: {
          baseURL: "https://api.openai.com/v1",
          apiKey: "sk-openpx-test",
        },
      },
      model: {
        default: {
          provider: "openai",
          name: "gpt-5.4",
        },
      },
    });

    expect(parsed.model?.default?.name).toBe("gpt-5.4");
    expect(parsed.model?.small).toBeUndefined();
  });

  test("导出稳定的 JSON Schema 元数据", () => {
    expect("id" in openPXConfigJsonSchema || "$id" in openPXConfigJsonSchema).toBe(false);
    expect(openPXConfigJsonSchema.properties?.provider).toBeDefined();
    expect(openPXConfigJsonSchema.properties?.model).toBeDefined();
    expect(openPXConfigJsonSchema.properties?.ui).toBeDefined();
  });
});
