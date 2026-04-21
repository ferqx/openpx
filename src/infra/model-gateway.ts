import { plannerResultSchema, type PlannerResult } from "../runtime/planning/planner-result";
import { executorResultSchema, type ExecutorResult } from "../runtime/execution/executor-result";
import {
  createDefaultFallbackPolicy,
  shouldFallbackToNextProvider,
  type FallbackPolicy,
} from "./provider/fallback-policy";
import {
  classifyProviderError,
  ModelGatewayError,
  type ModelGatewayErrorKind,
} from "./provider/errors";
import { OpenAIChatClient } from "./provider/openai-chat-client";
import {
  resolveProviderBinding,
  type ResolvedProviderBinding,
} from "./provider/profile";
import {
  createDefaultRetryPolicy,
  resolveOperationTimeoutMs,
  resolveRetryBackoffMs,
  shouldRetryModelRequest,
  type RetryPolicy,
} from "./provider/retry-policy";
import {
  createDefaultModelSelectionPolicy,
  resolveOperationModel,
  type ModelOperation,
  type ModelSelectionPolicy,
  type ResolvedModelSlot,
  type ResolvedModelSlots,
} from "./provider/selection-policy";
import {
  createModelTelemetryPayload,
  type ModelTelemetryEvent,
} from "./provider/telemetry";

export type PlannerModelInput = {
  prompt: string;
  threadId?: string;
  taskId?: string;
  signal?: AbortSignal;
};

export type PlannerModelOutput = {
  summary: string;
  plannerResult?: PlannerResult;
};

export type ExecutorModelInput = {
  prompt: string;
  threadId?: string;
  taskId?: string;
  signal?: AbortSignal;
};

export type ExecutorModelOutput = ExecutorResult;

export type VerifierModelInput = {
  prompt: string;
  threadId?: string;
  taskId?: string;
  signal?: AbortSignal;
};

export type VerifierModelOutput = {
  summary: string;
  isValid: boolean;
};

export type RespondModelInput = {
  prompt: string;
  threadId?: string;
  taskId?: string;
  signal?: AbortSignal;
};

export type RespondModelOutput = {
  summary: string;
};

export type ModelStatus = "idle" | "thinking" | "responding";

export type ModelGatewayEvent =
  | {
      type: "model.invocation_started";
      payload: { timestamp: number };
    }
  | {
      type: "model.first_token_received";
      payload: { timestamp: number };
    }
  | {
      type: "model.completed";
      payload: {
        timestamp: number;
        duration: number;
        waitDuration: number;
        genDuration: number;
      };
    }
  | {
      type: "model.failed";
      payload: {
        timestamp: number;
        duration: number;
        error: string;
      };
    }
  | ModelTelemetryEvent;

type ModelMessage = ["system" | "user", string];

type OperationInput =
  | PlannerModelInput
  | ExecutorModelInput
  | VerifierModelInput
  | RespondModelInput;

type LegacyModelProviderConfig = {
  apiKey: string;
  baseURL: string;
  modelName: string;
};

export type ModelGateway = {
  plan(input: PlannerModelInput): Promise<PlannerModelOutput>;
  execute(input: ExecutorModelInput): Promise<ExecutorModelOutput>;
  verify(input: VerifierModelInput): Promise<VerifierModelOutput>;
  respond(input: RespondModelInput): Promise<RespondModelOutput>;
  onStatusChange(handler: (status: ModelStatus) => void): () => void;
  onEvent(handler: (event: ModelGatewayEvent) => void): () => void;
};

export type ModelGatewayOptions = {
  slots: ResolvedModelSlots;
  fallbacks?: ResolvedProviderBinding[];
  selectionPolicy?: ModelSelectionPolicy;
  retryPolicy?: RetryPolicy;
  fallbackPolicy?: FallbackPolicy;
  enableTelemetry?: boolean;
  enableCostTracking?: boolean;
  transportClient?: OpenAIChatClient;
};

type LegacyCreateModelGatewayConfig = {
  apiKey?: string;
  baseURL?: string;
  modelName?: string;
  timeoutMs?: number;
  fallbacks?: LegacyModelProviderConfig[];
};

function normalizeModelText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  return JSON.parse(candidate);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parsePlannerModelOutput(text: string): PlannerModelOutput {
  try {
    const parsed = parseJsonObject(text);
    if (!isRecord(parsed) || typeof parsed.summary !== "string") {
      throw new Error("planner envelope missing summary");
    }

    const plannerResult = parsed.plannerResult === undefined
      ? undefined
      : plannerResultSchema.parse(parsed.plannerResult);

    return {
      summary: parsed.summary.trim(),
      plannerResult,
    };
  } catch {
    return {
      summary: text.trim(),
    };
  }
}

export function parseExecutorModelOutput(text: string): ExecutorModelOutput {
  try {
    return executorResultSchema.parse(parseJsonObject(text));
  } catch {
    return {
      summary: text.trim(),
      toolCalls: [],
    };
  }
}

function parseVerifierModelOutput(text: string): VerifierModelOutput {
  try {
    const parsed = parseJsonObject(text);
    if (isRecord(parsed) && typeof parsed.summary === "string" && typeof parsed.isValid === "boolean") {
      return {
        summary: parsed.summary.trim(),
        isValid: parsed.isValid,
      };
    }
  } catch {
    // 使用 legacy 文本兜底，兼容现有测试与 provider 返回。
  }

  const normalized = text.trim();
  const isValid = normalized.toUpperCase().startsWith("VALID");
  const summary = normalized.replace(/^(VALID|INVALID):\s*/i, "");
  return { summary, isValid };
}

function parseRespondModelOutput(text: string): RespondModelOutput {
  return {
    summary: text.trim(),
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      reject(new ModelGatewayError({
        kind: "cancelled_error",
        message: "request cancelled by user",
        retryable: false,
      }));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function resolveLegacyBinding(config: LegacyModelProviderConfig): ResolvedProviderBinding {
  return resolveProviderBinding({
    providerId: "legacy",
    definition: {
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      notes: "Legacy OpenAI-compatible binding shim.",
    },
  });
}

function createLegacySlot(config: LegacyModelProviderConfig): ResolvedModelSlot {
  return {
    provider: resolveLegacyBinding(config),
    name: config.modelName,
  };
}

function coerceGatewayOptions(
  config: ModelGatewayOptions | LegacyCreateModelGatewayConfig,
): ModelGatewayOptions {
  if ("slots" in config) {
    return config;
  }

  if (!config.apiKey || !config.baseURL || !config.modelName) {
    throw new ModelGatewayError({
      kind: "config_error",
      message: "missing primary model configuration",
      retryable: false,
    });
  }

  const retryPolicy = config.timeoutMs === undefined
    ? undefined
    : {
        ...createDefaultRetryPolicy(),
        operationTimeoutMs: {
          plan: config.timeoutMs,
          execute: config.timeoutMs,
          verify: config.timeoutMs,
          respond: config.timeoutMs,
        },
      };

  return {
    slots: {
      default: createLegacySlot({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        modelName: config.modelName,
      }),
      small: createLegacySlot({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        modelName: config.modelName,
      }),
    },
    fallbacks: config.fallbacks?.map(resolveLegacyBinding),
    retryPolicy,
  };
}

class OpenAICompatibleModelGateway implements ModelGateway {
  private slots: ResolvedModelSlots;
  private fallbackProviders: ResolvedProviderBinding[];
  private selectionPolicy: ModelSelectionPolicy;
  private retryPolicy: RetryPolicy;
  private fallbackPolicy: FallbackPolicy;
  private enableTelemetry: boolean;
  private enableCostTracking: boolean;
  private transportClient: OpenAIChatClient;
  private statusHandlers = new Set<(status: ModelStatus) => void>();
  private eventHandlers = new Set<(event: ModelGatewayEvent) => void>();

  constructor(options: ModelGatewayOptions) {
    this.slots = options.slots;
    this.fallbackProviders = [...(options.fallbacks ?? [])];
    this.selectionPolicy = options.selectionPolicy ?? createDefaultModelSelectionPolicy();
    this.retryPolicy = options.retryPolicy ?? createDefaultRetryPolicy();
    this.fallbackPolicy = options.fallbackPolicy ?? createDefaultFallbackPolicy();
    this.enableTelemetry = options.enableTelemetry ?? true;
    this.enableCostTracking = options.enableCostTracking ?? true;
    this.transportClient = options.transportClient ?? new OpenAIChatClient();
  }

  onStatusChange(handler: (status: ModelStatus) => void) {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  onEvent(handler: (event: ModelGatewayEvent) => void) {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emitStatus(status: ModelStatus) {
    this.statusHandlers.forEach((handler) => handler(status));
  }

  private emitEvent(event: ModelGatewayEvent) {
    this.eventHandlers.forEach((handler) => handler(event));
  }

  private emitTelemetry(event: ModelTelemetryEvent) {
    if (!this.enableTelemetry) {
      return;
    }
    this.emitEvent(event);
  }

  private async invokeWithPolicies<T>(input: {
    operation: ModelOperation;
    messages: ModelMessage[];
    signal?: AbortSignal;
    threadId?: string;
    taskId?: string;
    requireJsonMode: boolean;
    allowPromptJsonFallback: boolean;
    parse: (text: string) => T;
  }): Promise<T> {
    const selectedModel = resolveOperationModel(this.slots, this.selectionPolicy, input.operation);
    const providers = [
      selectedModel.binding,
      ...this.fallbackProviders,
    ];
    let lastError: ModelGatewayError | undefined;

    for (let providerIndex = 0; providerIndex < providers.length; providerIndex += 1) {
      const binding = providers[providerIndex];
      if (!binding) {
        continue;
      }

      const model = selectedModel.model;
      let retryCount = 0;

      while (true) {
        const startedAt = Date.now();
        let firstTokenAt: number | undefined;
        this.emitEvent({
          type: "model.invocation_started",
          payload: {
            timestamp: startedAt,
          },
        });
        this.emitStatus("thinking");

        try {
          const result = await this.transportClient.invoke({
            binding,
            timeoutMs: resolveOperationTimeoutMs(input.operation, this.retryPolicy),
            request: {
              model,
              messages: input.messages.map(([role, content]) => ({ role, content })),
              stream: true,
              temperature: 0,
              requireJsonMode: input.requireJsonMode,
              allowPromptJsonFallback: input.allowPromptJsonFallback,
              requestUsage: this.enableCostTracking,
            },
            signal: input.signal,
            onFirstToken: (timestamp) => {
              firstTokenAt = timestamp;
              this.emitEvent({
                type: "model.first_token_received",
                payload: { timestamp },
              });
              this.emitStatus("responding");
            },
          });

          const completedAt = result.timing.endedAt;
          const waitDuration = Math.max((result.timing.firstTokenAt ?? completedAt) - startedAt, 0);
          const genDuration = Math.max(completedAt - (result.timing.firstTokenAt ?? completedAt), 0);
          this.emitEvent({
            type: "model.completed",
            payload: {
              timestamp: completedAt,
              duration: completedAt - startedAt,
              waitDuration,
              genDuration,
            },
          });
          this.emitTelemetry(createModelTelemetryPayload({
            providerId: binding.profile.providerId,
            baseURL: binding.profile.baseURL,
            model,
            operation: input.operation,
            fallbackCount: providerIndex,
            status: "completed",
            requestId: result.requestId,
            usage: this.enableCostTracking ? result.usage : undefined,
            timing: result.timing,
            context: {
              threadId: input.threadId,
              taskId: input.taskId,
            },
          }));

          const text = normalizeModelText(result.content);
          if (!text) {
            throw new ModelGatewayError({
              kind: "invalid_response_error",
              message: "model returned an empty response",
              providerId: binding.profile.providerId,
              retryable: false,
            });
          }

          return input.parse(text);
        } catch (error) {
          const typedError = error instanceof ModelGatewayError
            ? error
            : classifyProviderError(error, {
                providerId: binding.profile.providerId,
              });
          const endedAt = Date.now();

          this.emitEvent({
            type: "model.failed",
            payload: {
              timestamp: endedAt,
              duration: endedAt - startedAt,
              error: typedError.message,
            },
          });
          this.emitTelemetry(createModelTelemetryPayload({
            providerId: binding.profile.providerId,
            baseURL: binding.profile.baseURL,
            model,
            operation: input.operation,
            fallbackCount: providerIndex,
            status: typedError.kind === "cancelled_error" ? "cancelled" : "failed",
            errorKind: typedError.kind,
            requestId: typedError.requestId,
            timing: {
              startedAt,
              firstTokenAt,
              endedAt,
            },
            context: {
              threadId: input.threadId,
              taskId: input.taskId,
            },
          }));

          if (shouldRetryModelRequest(typedError, this.retryPolicy, retryCount)) {
            const backoffMs = resolveRetryBackoffMs(retryCount, this.retryPolicy);
            retryCount += 1;
            await sleep(backoffMs, input.signal);
            continue;
          }

          lastError = typedError;
          const remainingProviders = providers.length - providerIndex - 1;
          if (shouldFallbackToNextProvider({
            error: typedError,
            attemptIndex: providerIndex,
            remainingProviders,
            policy: this.fallbackPolicy,
          })) {
            break;
          }
          throw typedError;
        } finally {
          this.emitStatus("idle");
        }
      }
    }

    throw lastError ?? new ModelGatewayError({
      kind: "provider_error",
      message: "no provider returned a response",
    });
  }

  async plan(input: PlannerModelInput): Promise<PlannerModelOutput> {
    return this.invokeWithPolicies({
      operation: "plan",
      messages: [
        [
          "system",
          [
            "You are the planning agent run.",
            "Return JSON with this exact shape:",
            '{"summary":"<concise plan summary>","plannerResult":{"workPackages":[{"id":"pkg_id","objective":"...","capabilityMarker":"implementation_work","capabilityFamily":"feature_implementation","requiresApproval":false,"allowedTools":["read_file","apply_patch"],"inputRefs":["thread:goal"],"expectedArtifacts":["patch:file"]}],"acceptanceCriteria":["..."],"riskFlags":[],"approvalRequiredActions":[],"verificationScope":["..."],"decisionRequest":{"question":"<question when user choice is required>","options":[{"id":"option_a","label":"...","description":"...","continuation":"..."},{"id":"option_b","label":"...","description":"...","continuation":"..."}]}}}',
            "Use implementation_work for actionable feature/build/change requests, respond_only for pure conversation, and decisionRequest with 2-4 concrete options when a decision is required before execution.",
          ].join(" "),
        ],
        ["user", input.prompt],
      ],
      signal: input.signal,
      threadId: input.threadId,
      taskId: input.taskId,
      requireJsonMode: true,
      allowPromptJsonFallback: true,
      parse: parsePlannerModelOutput,
    });
  }

  async execute(input: ExecutorModelInput): Promise<ExecutorModelOutput> {
    return this.invokeWithPolicies({
      operation: "execute",
      messages: [
        [
          "system",
          [
            "You are the executor agent run.",
            "Return JSON only with this exact shape:",
            '{"summary":"<brief execution plan summary>","toolCalls":[{"toolCallId":"tool_unique_id","toolName":"apply_patch|exec|read_file","args":{},"path":"relative/or/absolute/path","action":"create_file|modify_file|delete_file","changedFiles":1,"command":"bun","commandArgs":["test"],"cwd":".","timeoutMs":120000}]}',
            "Use apply_patch for file creation, file modification, and file deletion; read_file for file reads; and exec for terminal commands.",
            "Prefer relative paths under the current project. Do not claim work is complete unless it is represented as a toolCall.",
          ].join(" "),
        ],
        ["user", input.prompt],
      ],
      signal: input.signal,
      threadId: input.threadId,
      taskId: input.taskId,
      requireJsonMode: true,
      allowPromptJsonFallback: true,
      parse: parseExecutorModelOutput,
    });
  }

  async verify(input: VerifierModelInput): Promise<VerifierModelOutput> {
    return this.invokeWithPolicies({
      operation: "verify",
      messages: [
        [
          "system",
          'You are the verifier. Return JSON with shape {"summary":"<brief verification summary>","isValid":true|false}.',
        ],
        ["user", input.prompt],
      ],
      signal: input.signal,
      threadId: input.threadId,
      taskId: input.taskId,
      requireJsonMode: true,
      allowPromptJsonFallback: false,
      parse: parseVerifierModelOutput,
    });
  }

  async respond(input: RespondModelInput): Promise<RespondModelOutput> {
    return this.invokeWithPolicies({
      operation: "respond",
      messages: [
        ["system", "You are a helpful AI assistant. Respond naturally and concisely."],
        ["user", input.prompt],
      ],
      signal: input.signal,
      threadId: input.threadId,
      taskId: input.taskId,
      requireJsonMode: false,
      allowPromptJsonFallback: false,
      parse: parseRespondModelOutput,
    });
  }
}

export function createModelGateway(config: ModelGatewayOptions | LegacyCreateModelGatewayConfig): ModelGateway {
  return new OpenAICompatibleModelGateway(coerceGatewayOptions(config));
}

export function createMultiProviderGateway(
  options: ModelGatewayOptions | {
    primary: LegacyModelProviderConfig;
    fallbacks?: LegacyModelProviderConfig[];
  },
): ModelGateway {
  if ("slots" in options) {
    return new OpenAICompatibleModelGateway(options as ModelGatewayOptions);
  }

  const legacyOptions = options as {
    primary: LegacyModelProviderConfig;
    fallbacks?: LegacyModelProviderConfig[];
  };
  return new OpenAICompatibleModelGateway({
    slots: {
      default: createLegacySlot(legacyOptions.primary),
      small: createLegacySlot(legacyOptions.primary),
    },
    fallbacks: legacyOptions.fallbacks?.map(resolveLegacyBinding),
  });
}

export { ModelGatewayError, type ModelGatewayErrorKind } from "./provider/errors";
