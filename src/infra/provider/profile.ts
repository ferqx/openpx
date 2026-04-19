import type { ProviderDefinitionConfig } from "../../config/types";

/** OpenAI-compatible provider 连接定义。 */
export type ProviderProfile = {
  providerId: string;
  displayName: string;
  baseURL: string;
  supportsStreaming: boolean;
  supportsJsonMode: boolean;
  supportsUsageFields: boolean;
  unsupportedParams: string[];
  notes: string;
};

/** v1 中解析后的 provider 形状。 */
export type ResolvedProviderProfile = ProviderProfile;

/** 绑定了实际 apiKey 的 provider 连接描述。 */
export type ResolvedProviderBinding = {
  profile: ResolvedProviderProfile;
  apiKey?: string;
};

/** 运行时解析单个 provider binding。 */
export function resolveProviderBinding(input: {
  providerId: string;
  definition: ProviderDefinitionConfig;
}): ResolvedProviderBinding {
  const providerId = input.providerId.trim();
  if (!providerId) {
    throw new Error("providerId is required");
  }

  const baseURL = input.definition.baseURL?.trim();
  if (!baseURL) {
    throw new Error(`provider definition is incomplete: ${providerId}`);
  }

  return {
    profile: {
      providerId,
      displayName: input.definition.displayName ?? providerId,
      baseURL,
      supportsStreaming: input.definition.supportsStreaming ?? true,
      supportsJsonMode: input.definition.supportsJsonMode ?? true,
      supportsUsageFields: input.definition.supportsUsageFields ?? true,
      unsupportedParams: [...(input.definition.unsupportedParams ?? [])],
      notes: input.definition.notes ?? `Configured provider ${providerId}.`,
    },
    apiKey: input.definition.apiKey,
  };
}
