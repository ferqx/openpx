import { basename, extname } from "node:path";
import type { OpenPXConfig, ResolvedConfigInventory } from "./types";

function getAvailableProviderIds(config: OpenPXConfig): Set<string> {
  return new Set(Object.keys(config.provider ?? {}));
}

function validateProviderDefinitions(config: OpenPXConfig): void {
  for (const [providerId, provider] of Object.entries(config.provider ?? {})) {
    if (!provider.baseURL || !provider.apiKey) {
      throw new Error(`provider definition is incomplete: ${providerId}`);
    }
  }
}

function validateModelRef(input: {
  slotName: "default" | "small";
  model: NonNullable<OpenPXConfig["model"]>[keyof NonNullable<OpenPXConfig["model"]>];
  providerIds: Set<string>;
}): void {
  if (!input.model) {
    return;
  }
  if (!input.model.provider) {
    throw new Error(`model.${input.slotName}.provider is required`);
  }
  if (!input.model.name) {
    throw new Error(`model.${input.slotName}.name is required`);
  }
  if (!input.providerIds.has(input.model.provider)) {
    throw new Error(`model.${input.slotName} references unknown provider: ${input.model.provider}`);
  }
}

function validateModelSlots(input: {
  config: OpenPXConfig;
  providerIds: Set<string>;
  allowMissingModel?: boolean;
}): void {
  const defaultModel = input.config.model?.default;
  const smallModel = input.config.model?.small;

  if (!defaultModel) {
    if (smallModel !== undefined && smallModel !== null) {
      throw new Error("model.default is required");
    }
    if (!input.allowMissingModel) {
      throw new Error("model.default is required");
    }
    return;
  }
  validateModelRef({
    slotName: "default",
    model: defaultModel,
    providerIds: input.providerIds,
  });

  if (smallModel === undefined || smallModel === null) {
    return;
  }
  validateModelRef({
    slotName: "small",
    model: smallModel,
    providerIds: input.providerIds,
  });
}

function validateDefaultAgent(
  defaultAgent: string | undefined,
  inventory: ResolvedConfigInventory,
): void {
  if (!defaultAgent || inventory.agents.length === 0) {
    return;
  }

  const knownAgents = new Set(
    inventory.agents.map((path) => basename(path, extname(path))),
  );
  if (!knownAgents.has(defaultAgent)) {
    throw new Error(`defaultAgent does not exist: ${defaultAgent}`);
  }
}

/** 做跨字段与 inventory 校验。 */
export function validateResolvedOpenPXConfig(input: {
  config: OpenPXConfig;
  inventory: ResolvedConfigInventory;
  allowMissingModel?: boolean;
}): void {
  validateProviderDefinitions(input.config);

  const providerIds = getAvailableProviderIds(input.config);
  validateModelSlots({
    config: input.config,
    providerIds,
    allowMissingModel: input.allowMissingModel,
  });

  validateDefaultAgent(input.config.agent?.defaultAgent, input.inventory);
}
