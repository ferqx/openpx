import { describe, expect, test } from "bun:test";
import { validateResolvedOpenPXConfig } from "../../src/config/validator";
import type { OpenPXConfig, ResolvedConfigInventory } from "../../src/config/types";

describe("validateResolvedOpenPXConfig", () => {
  test("校验 model 槽位引用的 provider 必须存在", () => {
    const config: OpenPXConfig = {
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
        small: {
          provider: "missing",
          name: "llama-3.1-8b-instant",
        },
      },
    };

    expect(() =>
      validateResolvedOpenPXConfig({
        config,
        inventory: {
          agents: [],
          skills: [],
          tools: [],
        },
      }),
    ).toThrow("model.small references unknown provider: missing");
  });

  test("当 inventory 可判定时校验 defaultAgent 存在", () => {
    const config: OpenPXConfig = {
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
        small: {
          provider: "openai",
          name: "gpt-5-mini",
        },
      },
      agent: {
        defaultAgent: "coder",
      },
    };
    const inventory: ResolvedConfigInventory = {
      agents: ["/tmp/agents/reviewer.jsonc"],
      skills: [],
      tools: [],
    };

    expect(() =>
      validateResolvedOpenPXConfig({ config, inventory }),
    ).toThrow("defaultAgent does not exist: coder");
  });

  test("允许 small 模型槽位缺省，运行时可回落到 default", () => {
    const config: OpenPXConfig = {
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
      } as OpenPXConfig["model"],
    };

    expect(() =>
      validateResolvedOpenPXConfig({
        config,
        inventory: {
          agents: [],
          skills: [],
          tools: [],
        },
      }),
    ).not.toThrow();
  });

  test("provider 条目缺少 apiKey 时报错", () => {
    const config: OpenPXConfig = {
      provider: {
        custom: {
          baseURL: "https://example.invalid/v1",
        },
      },
      model: {
        default: {
          provider: "custom",
          name: "kimi-k2.5",
        },
        small: {
          provider: "custom",
          name: "kimi-k2.5-mini",
        },
      },
    };

    expect(() =>
      validateResolvedOpenPXConfig({
        config,
        inventory: {
          agents: [],
          skills: [],
          tools: [],
        },
      }),
    ).toThrow("provider definition is incomplete: custom");
  });
});
