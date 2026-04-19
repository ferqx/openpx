import type { ModelGatewayError, ModelGatewayErrorKind } from "./errors";
import type { ModelOperation } from "./selection-policy";

/** retry/timeout 控制面。 */
export type RetryPolicy = {
  maxRetries: number;
  backoffMs: number;
  operationTimeoutMs: Record<ModelOperation, number>;
  retryableErrorKinds: readonly ModelGatewayErrorKind[];
};

/** M3 v1 默认 retry/timeout 策略。 */
export function createDefaultRetryPolicy(): RetryPolicy {
  return {
    maxRetries: 1,
    backoffMs: 250,
    operationTimeoutMs: {
      plan: 120_000,
      verify: 60_000,
      respond: 90_000,
    },
    retryableErrorKinds: [
      "network_error",
      "provider_error",
      "rate_limit_error",
      "timeout_error",
    ],
  };
}

/** 解析 operation 对应的 timeout。 */
export function resolveOperationTimeoutMs(
  operation: ModelOperation,
  policy: RetryPolicy,
): number {
  return policy.operationTimeoutMs[operation];
}

/** 判断当前错误是否可重试。 */
export function shouldRetryModelRequest(
  error: ModelGatewayError,
  policy: RetryPolicy,
  retryCount = 0,
): boolean {
  return retryCount < policy.maxRetries && policy.retryableErrorKinds.includes(error.kind);
}

/** 解析简单线性退避。 */
export function resolveRetryBackoffMs(retryCount: number, policy: RetryPolicy): number {
  return Math.max(policy.backoffMs * (retryCount + 1), 0);
}
