import { ModelGatewayError } from "./errors";

/** OpenAI-compatible 消息最小形状。 */
export type OpenAICompatibleMessage = {
  role: "system" | "user";
  content: string;
};

/** facade 传给 param filter 的规范请求形状。 */
export type CanonicalProviderRequest = {
  model: string;
  messages: OpenAICompatibleMessage[];
  stream: boolean;
  temperature: number;
  requireJsonMode: boolean;
  allowPromptJsonFallback: boolean;
  requestUsage: boolean;
};

/** 传输层真正消费的最小参数形状。 */
export type OpenAICompatibleRequestParams = {
  model: string;
  messages: OpenAICompatibleMessage[];
  stream: boolean;
  temperature: number;
  response_format?: {
    type: "json_object";
  };
  stream_options?: {
    include_usage: boolean;
  };
};

type ProfileLike = {
  providerId: string;
  supportsJsonMode: boolean;
  supportsUsageFields: boolean;
  unsupportedParams: string[];
};

/** 根据 profile 能力过滤 OpenAI-compatible 请求参数。 */
export function filterProviderParams(input: {
  profile: ProfileLike;
  request: CanonicalProviderRequest;
}): {
  params: OpenAICompatibleRequestParams;
  meta: {
    jsonModeDowngraded: boolean;
    usageCollectionDowngraded: boolean;
  };
} {
  const unsupportedParams = new Set(input.profile.unsupportedParams);
  const params: OpenAICompatibleRequestParams = {
    model: input.request.model,
    messages: input.request.messages,
    stream: input.request.stream,
    temperature: input.request.temperature,
  };

  let jsonModeDowngraded = false;
  if (input.request.requireJsonMode) {
    const canUseJsonMode = input.profile.supportsJsonMode && !unsupportedParams.has("response_format");
    if (canUseJsonMode) {
      params.response_format = {
        type: "json_object",
      };
    } else if (input.request.allowPromptJsonFallback) {
      jsonModeDowngraded = true;
    } else {
      throw new ModelGatewayError({
        kind: "config_error",
        message: `provider ${input.profile.providerId} does not support json_mode for this operation`,
        providerId: input.profile.providerId,
        retryable: false,
      });
    }
  }

  let usageCollectionDowngraded = false;
  if (input.request.requestUsage) {
    const canRequestUsage = input.profile.supportsUsageFields && !unsupportedParams.has("stream_options");
    if (canRequestUsage) {
      params.stream_options = {
        include_usage: true,
      };
    } else {
      usageCollectionDowngraded = true;
    }
  }

  return {
    params,
    meta: {
      jsonModeDowngraded,
      usageCollectionDowngraded,
    },
  };
}
