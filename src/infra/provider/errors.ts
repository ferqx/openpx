/** 模型网关统一错误分类。 */
export type ModelGatewayErrorKind =
  | "config_error"
  | "network_error"
  | "provider_error"
  | "rate_limit_error"
  | "timeout_error"
  | "cancelled_error"
  | "invalid_response_error";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  const record = asRecord(error);
  if (record && typeof record.message === "string") {
    return record.message;
  }
  return "unknown model gateway error";
}

function getErrorStatus(error: unknown): number | undefined {
  const record = asRecord(error);
  if (!record) {
    return undefined;
  }
  if (typeof record.status === "number") {
    return record.status;
  }
  const response = asRecord(record.response);
  if (response && typeof response.status === "number") {
    return response.status;
  }
  return undefined;
}

function getErrorCode(error: unknown): string | undefined {
  const record = asRecord(error);
  if (!record) {
    return undefined;
  }
  if (typeof record.code === "string") {
    return record.code;
  }
  const innerError = asRecord(record.error);
  if (innerError && typeof innerError.code === "string") {
    return innerError.code;
  }
  return undefined;
}

function getRequestId(error: unknown): string | undefined {
  const record = asRecord(error);
  if (!record) {
    return undefined;
  }
  if (typeof record.request_id === "string") {
    return record.request_id;
  }
  if (typeof record.requestId === "string") {
    return record.requestId;
  }
  return undefined;
}

function isRetryableKind(kind: ModelGatewayErrorKind): boolean {
  return kind === "network_error"
    || kind === "provider_error"
    || kind === "rate_limit_error"
    || kind === "timeout_error";
}

/** 统一错误对象：供 gateway 与 policy 共享。 */
export class ModelGatewayError extends Error {
  providerId?: string;
  retryable: boolean;
  httpStatus?: number;
  providerCode?: string;
  requestId?: string;
  originalError?: unknown;

  constructor(input: {
    kind: ModelGatewayErrorKind;
    message: string;
    providerId?: string;
    retryable?: boolean;
    httpStatus?: number;
    providerCode?: string;
    requestId?: string;
    originalError?: unknown;
  }) {
    super(input.message);
    this.name = "ModelGatewayError";
    this.kind = input.kind;
    this.providerId = input.providerId;
    this.retryable = input.retryable ?? isRetryableKind(input.kind);
    this.httpStatus = input.httpStatus;
    this.providerCode = input.providerCode;
    this.requestId = input.requestId;
    this.originalError = input.originalError;
  }

  kind: ModelGatewayErrorKind;
}

/** 把 provider 异常压平为统一 taxonomy。 */
export function classifyProviderError(
  error: unknown,
  context?: {
    providerId?: string;
    cancelledByCaller?: boolean;
    timeoutMs?: number;
  },
): ModelGatewayError {
  if (error instanceof ModelGatewayError) {
    return error;
  }

  if (error instanceof Error && error.name === "AbortError") {
    if (context?.cancelledByCaller) {
      return new ModelGatewayError({
        kind: "cancelled_error",
        message: "request cancelled by user",
        providerId: context.providerId,
        retryable: false,
        originalError: error,
      });
    }
    return new ModelGatewayError({
      kind: "timeout_error",
      message: `request timed out after ${context?.timeoutMs ?? 0}ms`,
      providerId: context?.providerId,
      originalError: error,
    });
  }

  const status = getErrorStatus(error);
  const providerCode = getErrorCode(error);
  const requestId = getRequestId(error);

  if (status === 429) {
    return new ModelGatewayError({
      kind: "rate_limit_error",
      message: "rate limit exceeded",
      providerId: context?.providerId,
      httpStatus: status,
      providerCode,
      requestId,
      originalError: error,
    });
  }

  if (typeof status === "number" && status >= 500) {
    return new ModelGatewayError({
      kind: "provider_error",
      message: `provider error: ${status}`,
      providerId: context?.providerId,
      httpStatus: status,
      providerCode,
      requestId,
      originalError: error,
    });
  }

  if (typeof status === "number" && status >= 400) {
    return new ModelGatewayError({
      kind: "config_error",
      message: `invalid request: ${status}`,
      providerId: context?.providerId,
      retryable: false,
      httpStatus: status,
      providerCode,
      requestId,
      originalError: error,
    });
  }

  return new ModelGatewayError({
    kind: "network_error",
    message: getErrorMessage(error),
    providerId: context?.providerId,
    originalError: error,
  });
}
