import type { ResolvedProviderBinding } from "./profile";

/** 模型操作类型：对应 gateway 暴露的三类稳定入口。 */
export type ModelOperation = "plan" | "verify" | "respond";

/** 模型层级：默认模型与轻量模型。 */
export type ModelTier = "default" | "small";

/** 模型选择策略：只决定 operation 对应哪一层模型。 */
export type ModelSelectionPolicy = {
  operationModelOverride: Record<ModelOperation, ModelTier>;
};

/** 解析后的模型槽位。 */
export type ResolvedModelSlot = {
  provider: ResolvedProviderBinding;
  name: string;
};

/** 运行时可选模型槽位集合。 */
export type ResolvedModelSlots = {
  default: ResolvedModelSlot;
  small: ResolvedModelSlot;
};

/** M3 默认策略：plan/verify 走默认模型，respond 走小模型。 */
export function createDefaultModelSelectionPolicy(): ModelSelectionPolicy {
  return {
    operationModelOverride: {
      plan: "default",
      verify: "default",
      respond: "small",
    },
  };
}

/** 根据 operation 和模型槽位解析本次实际模型。 */
export function resolveOperationModel(
  slots: ResolvedModelSlots,
  policy: ModelSelectionPolicy,
  operation: ModelOperation,
): {
  binding: ResolvedProviderBinding;
  model: string;
  tier: ModelTier;
} {
  const tier = policy.operationModelOverride[operation] ?? "default";
  const slot = tier === "small" ? slots.small : slots.default;

  return {
    binding: slot.provider,
    model: slot.name,
    tier,
  };
}
