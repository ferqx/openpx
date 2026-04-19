import { describe, expect, test } from "bun:test";
import {
  resolveProviderBinding,
} from "../../src/infra/provider/profile";
import {
  createDefaultModelSelectionPolicy,
  resolveOperationModel,
} from "../../src/infra/provider/selection-policy";
import { filterProviderParams } from "../../src/infra/provider/param-filter";
import { classifyProviderError } from "../../src/infra/provider/errors";
import {
  createDefaultRetryPolicy,
  resolveOperationTimeoutMs,
  shouldRetryModelRequest,
} from "../../src/infra/provider/retry-policy";
import {
  createDefaultFallbackPolicy,
  shouldFallbackToNextProvider,
} from "../../src/infra/provider/fallback-policy";
import { createModelTelemetryPayload } from "../../src/infra/provider/telemetry";

describe("provider profiles and policies", () => {
  test("从显式模型槽位解析不同 operation 的 provider 与模型", () => {
    const openaiBinding = resolveProviderBinding({
      providerId: "openai",
      definition: {
        baseURL: "https://api.openai.com/v1",
        apiKey: "openai-key",
      },
    });
    const groqBinding = resolveProviderBinding({
      providerId: "groq",
      definition: {
        baseURL: "https://api.groq.com/openai/v1",
        apiKey: "groq-key",
      },
    });
    const selectionPolicy = createDefaultModelSelectionPolicy();
    const slots = {
      default: {
        provider: openaiBinding,
        name: "gpt-5.4",
      },
      small: {
        provider: groqBinding,
        name: "llama-3.1-8b-instant",
      },
    };

    expect(openaiBinding.profile.providerId).toBe("openai");
    expect(openaiBinding.apiKey).toBe("openai-key");
    expect(resolveOperationModel(slots, selectionPolicy, "plan").binding.profile.providerId).toBe("openai");
    expect(resolveOperationModel(slots, selectionPolicy, "respond").binding.profile.providerId).toBe("groq");
  });

  test("filters unsupported params and reports explicit json-mode downgrade", () => {
    const binding = resolveProviderBinding({
      providerId: "custom",
      definition: {
        apiKey: "custom-key",
        baseURL: "https://example.invalid/v1",
        supportsJsonMode: false,
        unsupportedParams: ["response_format", "stream_options"],
      },
    });

    const filtered = filterProviderParams({
      profile: binding.profile,
      request: {
        model: "kimi-k2.5",
        messages: [
          { role: "system", content: "Return json." },
          { role: "user", content: "Plan the work." },
        ],
        requireJsonMode: true,
        allowPromptJsonFallback: true,
        requestUsage: true,
        stream: true,
        temperature: 0,
      },
    });

    expect(filtered.params.response_format).toBeUndefined();
    expect(filtered.params.stream_options).toBeUndefined();
    expect(filtered.meta.jsonModeDowngraded).toBe(true);
  });

  test("classifies provider errors and resolves retry/fallback behavior", () => {
    const error = classifyProviderError(
      {
        status: 429,
        message: "rate limit",
      },
      { providerId: "groq" },
    );
    const retryPolicy = createDefaultRetryPolicy();
    const fallbackPolicy = createDefaultFallbackPolicy();

    expect(error.kind).toBe("rate_limit_error");
    expect(shouldRetryModelRequest(error, retryPolicy)).toBe(true);
    expect(shouldFallbackToNextProvider({
      error,
      attemptIndex: 0,
      remainingProviders: 1,
      policy: fallbackPolicy,
    })).toBe(true);
    expect(resolveOperationTimeoutMs("verify", retryPolicy)).toBe(60_000);
  });

  test("builds normalized telemetry payloads for provider attempts", () => {
    const payload = createModelTelemetryPayload({
      providerId: "openai",
      baseURL: "https://api.openai.com/v1",
      model: "gpt-5.4",
      operation: "plan",
      fallbackCount: 1,
      status: "completed",
      timing: {
        startedAt: 10,
        firstTokenAt: 40,
        endedAt: 90,
      },
      usage: {
        inputTokens: 12,
        outputTokens: 34,
      },
      context: {
        threadId: "thread-1",
        taskId: "task-1",
      },
    });

    expect(payload.type).toBe("model.telemetry");
    expect(payload.payload.waitDuration).toBe(30);
    expect(payload.payload.genDuration).toBe(50);
    expect(payload.payload.totalDuration).toBe(80);
    expect(payload.payload.outputTokens).toBe(34);
  });

  test("provider 能力字段未填写时使用运行时默认值", () => {
    const binding = resolveProviderBinding({
      providerId: "custom",
      definition: {
        baseURL: "https://gateway.example.test/v1",
        apiKey: "custom-key",
      },
    });

    expect(binding.profile.supportsStreaming).toBe(true);
    expect(binding.profile.supportsJsonMode).toBe(true);
    expect(binding.profile.supportsUsageFields).toBe(true);
    expect(binding.profile.unsupportedParams).toEqual([]);
  });
});
