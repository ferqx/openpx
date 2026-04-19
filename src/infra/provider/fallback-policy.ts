import type { ModelGatewayErrorKind, ModelGatewayError } from "./errors";

/** fallback 控制面：决定何时切到下一个 provider。 */
export type FallbackPolicy = {
  maxFallbacks: number;
  nonFallbackErrorKinds: readonly ModelGatewayErrorKind[];
};

/** M3 默认 fallback 策略。 */
export function createDefaultFallbackPolicy(): FallbackPolicy {
  return {
    maxFallbacks: 2,
    nonFallbackErrorKinds: [
      "config_error",
      "cancelled_error",
      "invalid_response_error",
    ],
  };
}

/** 判断是否应切到下一个 provider。 */
export function shouldFallbackToNextProvider(input: {
  error: ModelGatewayError;
  attemptIndex: number;
  remainingProviders: number;
  policy: FallbackPolicy;
}): boolean {
  return input.remainingProviders > 0
    && input.attemptIndex < input.policy.maxFallbacks
    && !input.policy.nonFallbackErrorKinds.includes(input.error.kind);
}
