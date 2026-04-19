import OpenAI from "openai";
import { classifyProviderError, ModelGatewayError } from "./errors";
import {
  filterProviderParams,
  type CanonicalProviderRequest,
} from "./param-filter";
import type { ResolvedProviderBinding } from "./profile";
import type { ModelUsage, ModelTiming } from "./telemetry";

type OpenAIChatChunkUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function extractChunkUsage(value: unknown): ModelUsage | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const usage = asRecord(record.usage) ?? record;
  const inputTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined;
  const outputTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined;
  if (inputTokens === undefined && outputTokens === undefined) {
    return undefined;
  }
  return {
    inputTokens,
    outputTokens,
  };
}

function extractChunkText(chunk: unknown): string {
  const record = asRecord(chunk);
  if (!record) {
    return "";
  }
  const choices = Array.isArray(record.choices) ? record.choices : [];
  return choices
    .map((choice) => {
      const choiceRecord = asRecord(choice);
      const delta = asRecord(choiceRecord?.delta);
      return typeof delta?.content === "string" ? delta.content : "";
    })
    .join("");
}

/** transport client 返回的标准化原始结果。 */
export type OpenAIChatClientResult = {
  content: string;
  usage?: ModelUsage;
  timing: ModelTiming;
  requestId?: string;
  meta: {
    jsonModeDowngraded: boolean;
    usageCollectionDowngraded: boolean;
  };
};

/** OpenAI-compatible transport client：只负责 SDK 调用与流式拼接。 */
export class OpenAIChatClient {
  async invoke(input: {
    binding: ResolvedProviderBinding;
    timeoutMs: number;
    request: CanonicalProviderRequest;
    signal?: AbortSignal;
    onFirstToken?: (timestamp: number) => void;
  }): Promise<OpenAIChatClientResult> {
    const { binding } = input;
    if (!binding.apiKey) {
      throw new ModelGatewayError({
        kind: "config_error",
        message: `missing apiKey for provider ${binding.profile.providerId}`,
        providerId: binding.profile.providerId,
        retryable: false,
      });
    }

    const filtered = filterProviderParams({
      profile: binding.profile,
      request: input.request,
    });
    const controller = new AbortController();
    let cancelledByCaller = false;
    const startedAt = Date.now();
    const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs);
    const abortFromCaller = () => {
      cancelledByCaller = true;
      controller.abort(input.signal?.reason);
    };

    if (input.signal?.aborted) {
      abortFromCaller();
    } else {
      input.signal?.addEventListener("abort", abortFromCaller, { once: true });
    }

    try {
      const client = new OpenAI({
        apiKey: binding.apiKey,
        baseURL: binding.profile.baseURL,
        maxRetries: 0,
      });

      const stream = await client.chat.completions.create({
        ...filtered.params,
        stream: true,
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming, {
        signal: controller.signal,
      });

      let firstTokenAt: number | undefined;
      let content = "";
      let usage: ModelUsage | undefined;

      for await (const chunk of stream) {
        const text = extractChunkText(chunk);
        if (text.length > 0) {
          if (!firstTokenAt) {
            firstTokenAt = Date.now();
            input.onFirstToken?.(firstTokenAt);
          }
          content += text;
        }

        usage = extractChunkUsage(chunk) ?? usage;
      }

      return {
        content,
        usage,
        timing: {
          startedAt,
          firstTokenAt,
          endedAt: Date.now(),
        },
        meta: filtered.meta,
      };
    } catch (error) {
      throw classifyProviderError(error, {
        providerId: binding.profile.providerId,
        cancelledByCaller,
        timeoutMs: input.timeoutMs,
      });
    } finally {
      clearTimeout(timeoutId);
      input.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}
