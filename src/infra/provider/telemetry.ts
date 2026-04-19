import type { ModelGatewayErrorKind } from "./errors";
import type { ModelOperation } from "./selection-policy";

/** 标准化 provider telemetry 事件。 */
export type ModelTelemetryEvent = {
  type: "model.telemetry";
  payload: {
    providerId: string;
    baseURL: string;
    model: string;
    operation: ModelOperation;
    threadId?: string;
    runId?: string;
    taskId?: string;
    requestId?: string;
    inputTokens?: number;
    outputTokens?: number;
    waitDuration: number;
    genDuration: number;
    totalDuration: number;
    status: "completed" | "failed" | "cancelled";
    errorKind?: ModelGatewayErrorKind;
    fallbackCount: number;
  };
};

/** SDK usage 最小标准形状。 */
export type ModelUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

/** timing 最小标准形状。 */
export type ModelTiming = {
  startedAt: number;
  firstTokenAt?: number;
  endedAt: number;
};

/** 生成标准化 telemetry payload。 */
export function createModelTelemetryPayload(input: {
  providerId: string;
  baseURL: string;
  model: string;
  operation: ModelOperation;
  fallbackCount: number;
  status: "completed" | "failed" | "cancelled";
  errorKind?: ModelGatewayErrorKind;
  requestId?: string;
  usage?: ModelUsage;
  timing: ModelTiming;
  context?: {
    threadId?: string;
    runId?: string;
    taskId?: string;
  };
}): ModelTelemetryEvent {
  const waitDuration = Math.max((input.timing.firstTokenAt ?? input.timing.endedAt) - input.timing.startedAt, 0);
  const genDuration = Math.max(input.timing.endedAt - (input.timing.firstTokenAt ?? input.timing.endedAt), 0);
  const totalDuration = Math.max(input.timing.endedAt - input.timing.startedAt, 0);

  return {
    type: "model.telemetry",
    payload: {
      providerId: input.providerId,
      baseURL: input.baseURL,
      model: input.model,
      operation: input.operation,
      threadId: input.context?.threadId,
      runId: input.context?.runId,
      taskId: input.context?.taskId,
      requestId: input.requestId,
      inputTokens: input.usage?.inputTokens,
      outputTokens: input.usage?.outputTokens,
      waitDuration,
      genDuration,
      totalDuration,
      status: input.status,
      errorKind: input.errorKind,
      fallbackCount: input.fallbackCount,
    },
  };
}
