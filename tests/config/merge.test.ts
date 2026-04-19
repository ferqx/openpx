import { describe, expect, test } from "bun:test";
import { mergeOpenPXConfig } from "../../src/config/merge";
import type { OpenPXConfig } from "../../src/config/types";

describe("mergeOpenPXConfig", () => {
  test("递归合并对象、覆盖标量并替换数组", () => {
    const base: OpenPXConfig = {
      provider: {
        openai: {
          baseURL: "https://api.openai.com/v1",
          apiKey: "sk-openpx-openai",
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
      runtime: {
        timeoutMs: 120_000,
      },
      ui: {
        tui: {
          verboseOutput: false,
          promptSuggestions: true,
        },
      },
    };
    const override: OpenPXConfig = {
      provider: {
        groq: {
          baseURL: "https://api.groq.com/openai/v1",
          apiKey: "gsk-openpx-groq",
        },
      },
      model: {
        small: {
          provider: "groq",
          name: "llama-3.1-8b-instant",
        },
      },
      runtime: {
        timeoutMs: 30_000,
      },
      ui: {
        tui: {
          verboseOutput: true,
        },
      },
    };

    const merged = mergeOpenPXConfig(base, override);
    expect(merged.model?.default).toBeDefined();
    expect(merged.model?.small).toBeDefined();

    expect(merged.provider?.openai?.baseURL).toBe("https://api.openai.com/v1");
    expect(merged.provider?.groq?.baseURL).toBe("https://api.groq.com/openai/v1");
    expect(merged.model?.default?.name).toBe("gpt-5.4");
    expect(merged.model?.small?.provider).toBe("groq");
    expect(merged.model?.small?.name).toBe("llama-3.1-8b-instant");
    expect(merged.runtime?.timeoutMs).toBe(30_000);
    expect(merged.ui?.tui?.verboseOutput).toBe(true);
    expect(merged.ui?.tui?.promptSuggestions).toBe(true);
  });

  test("null 表示显式清空", () => {
    const base: OpenPXConfig = {
      model: {
        small: {
          provider: "openai",
          name: "gpt-5-mini",
        },
      },
    };
    const override: OpenPXConfig = {
      model: {
        small: null,
      },
    };

    const merged = mergeOpenPXConfig(base, override);

    expect(merged.model?.small).toBeNull();
  });

  test("按 project-local > project > user 的优先级生效", () => {
    const user: OpenPXConfig = {
      runtime: {
        thinkingLevel: "low",
      },
    };
    const project: OpenPXConfig = {
      runtime: {
        thinkingLevel: "medium",
      },
    };
    const projectLocal: OpenPXConfig = {
      runtime: {
        thinkingLevel: "high",
      },
    };

    const merged = mergeOpenPXConfig(
      mergeOpenPXConfig(user, project),
      projectLocal,
    );

    expect(merged.runtime?.thinkingLevel).toBe("high");
  });
});
