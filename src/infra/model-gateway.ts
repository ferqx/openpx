import { ChatOpenAI } from "@langchain/openai";

export type PlannerModelInput = {
  prompt: string;
  threadId?: string;
  taskId?: string;
};

export type PlannerModelOutput = {
  summary: string;
};

export type VerifierModelInput = {
  prompt: string;
  threadId?: string;
  taskId?: string;
};

export type VerifierModelOutput = {
  summary: string;
  isValid: boolean;
};

export type RespondModelInput = {
  prompt: string;
  threadId?: string;
  taskId?: string;
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
    };

type ModelMessage = ["system" | "human", string];

type ModelInvocationResponse = {
  content: unknown;
} & Record<string, unknown>;

export type ModelGateway = {
  plan(input: PlannerModelInput): Promise<PlannerModelOutput>;
  verify(input: VerifierModelInput): Promise<VerifierModelOutput>;
  respond(input: RespondModelInput): Promise<RespondModelOutput>;
  onStatusChange(handler: (status: ModelStatus) => void): () => void;
  onEvent(handler: (event: ModelGatewayEvent) => void): () => void;
};

export type ModelGatewayErrorKind = 
  | "config_error"
  | "network_error"
  | "provider_error"
  | "rate_limit_error"
  | "timeout_error"
  | "invalid_response_error";

export class ModelGatewayError extends Error {
  constructor(public kind: ModelGatewayErrorKind, message: string, public originalError?: unknown) {
    super(message);
    this.name = "ModelGatewayError";
  }
}

export type ModelProviderConfig = {
  apiKey: string;
  baseURL: string;
  modelName: string;
  timeoutMs?: number;
};

export type ModelGatewayOptions = {
  primary: ModelProviderConfig;
  fallbacks?: ModelProviderConfig[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }

  return "unknown model gateway error";
}

function getErrorStatus(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  if (typeof error.status === "number") {
    return error.status;
  }

  const response = error.response;
  if (isRecord(response) && typeof response.status === "number") {
    return response.status;
  }

  return undefined;
}

class SingleProviderGateway {
  private model: ChatOpenAI;
  private timeoutMs: number;

  constructor(config: ModelProviderConfig) {
    this.timeoutMs = config.timeoutMs ?? 120000;
    this.model = new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.modelName,
      temperature: 0,
      maxRetries: 0,
      configuration: {
        baseURL: config.baseURL,
      },
    });
  }

  async invoke(
    messages: ModelMessage[],
    onStatus: (status: ModelStatus) => void,
    onEvent: (event: ModelGatewayEvent) => void,
  ): Promise<ModelInvocationResponse> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeoutMs);
    const startTime = Date.now();

    onEvent({ type: "model.invocation_started", payload: { timestamp: startTime } });
    onStatus("thinking");

    try {
      const stream = await this.model.stream(messages, { signal: controller.signal });
      
      let firstTokenTime: number | undefined;
      let fullContent = "";
      let lastChunk: ModelInvocationResponse | undefined;

      for await (const chunk of stream) {
        if (!firstTokenTime) {
          firstTokenTime = Date.now();
          onEvent({ type: "model.first_token_received", payload: { timestamp: firstTokenTime } });
          onStatus("responding");
        }
        
        const chunkContent = isRecord(chunk) ? chunk.content : undefined;
        if (typeof chunkContent === "string") {
          fullContent += chunkContent;
        } else if (Array.isArray(chunkContent)) {
          // Handle complex content if necessary
        }
        lastChunk = isRecord(chunk)
          ? { ...chunk, content: chunkContent }
          : { content: chunkContent };
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      onEvent({ 
        type: "model.completed", 
        payload: { 
          timestamp: endTime, 
          duration,
          waitDuration: firstTokenTime ? firstTokenTime - startTime : duration,
          genDuration: firstTokenTime ? endTime - firstTokenTime : 0
        } 
      });

      // Wrap the reconstructed content into an object that matches ChatOpenAI's response format
      return {
        ...(lastChunk ?? {}),
        content: fullContent,
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      onEvent({ type: "model.failed", payload: { timestamp: Date.now(), duration, error: getErrorMessage(error) } });
      
      if (error instanceof Error && error.name === "AbortError") {
        throw new ModelGatewayError("timeout_error", `request timed out after ${this.timeoutMs}ms`);
      }
      
      const status = getErrorStatus(error);
      if (status === 429) {
        throw new ModelGatewayError("rate_limit_error", "rate limit exceeded", error);
      }
      if (typeof status === "number" && status >= 500) {
        throw new ModelGatewayError("provider_error", `provider error: ${status}`, error);
      }
      if (typeof status === "number" && status >= 400) {
        throw new ModelGatewayError("config_error", `invalid request: ${status}`, error);
      }

      throw new ModelGatewayError("network_error", getErrorMessage(error), error);
    } finally {
      clearTimeout(id);
      onStatus("idle");
    }
  }
}

class MultiModelGateway implements ModelGateway {
  private providers: SingleProviderGateway[];
  private statusHandlers = new Set<(status: ModelStatus) => void>();
  private eventHandlers = new Set<(event: ModelGatewayEvent) => void>();

  constructor(options: ModelGatewayOptions) {
    this.providers = [
      new SingleProviderGateway(options.primary),
      ...(options.fallbacks ?? []).map(f => new SingleProviderGateway(f)),
    ];
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
    this.statusHandlers.forEach(h => h(status));
  }

  private emitEvent(event: ModelGatewayEvent) {
    this.eventHandlers.forEach(h => h(event));
  }

  private async tryAllProviders(messages: ModelMessage[]): Promise<ModelInvocationResponse> {
    let lastError: unknown;
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      if (!provider) continue;
      
      try {
        if (i > 0) {
          console.warn(`[TELEMETRY] model.failover: switching to fallback provider ${i}`);
        }
        const result = await provider.invoke(
          messages, 
          s => this.emitStatus(s),
          e => this.emitEvent(e)
        );
        return result;
      } catch (e) {
        lastError = e;
        if (e instanceof ModelGatewayError && e.kind === "config_error") {
          break;
        }
      }
    }
    throw lastError;
  }

  async plan(input: PlannerModelInput): Promise<PlannerModelOutput> {
    const response = await this.tryAllProviders([
      ["system", "You are the planning worker. Return a concise implementation plan summary."],
      ["human", input.prompt],
    ]);

    const summary = normalizeModelText(response.content);
    if (!summary) {
      throw new ModelGatewayError("invalid_response_error", "model returned an empty response");
    }
    return { summary };
  }

  async verify(input: VerifierModelInput): Promise<VerifierModelOutput> {
    const response = await this.tryAllProviders([
      ["system", "You are the verifier. Confirm if the task is complete. Return 'VALID: <summary>' or 'INVALID: <reason>'."],
      ["human", input.prompt],
    ]);

    const text = normalizeModelText(response.content);
    if (!text) {
      throw new ModelGatewayError("invalid_response_error", "model returned an empty response");
    }

    const isValid = text.toUpperCase().startsWith("VALID");
    const summary = text.replace(/^(VALID|INVALID):\s*/i, "");
    return { summary, isValid };
  }

  async respond(input: RespondModelInput): Promise<RespondModelOutput> {
    const response = await this.tryAllProviders([
      ["system", "You are a helpful AI assistant. Respond naturally and concisely."],
      ["human", input.prompt],
    ]);

    const summary = normalizeModelText(response.content);
    if (!summary) {
      throw new ModelGatewayError("invalid_response_error", "model returned an empty response");
    }
    return { summary };
  }
}

export function createModelGateway(config: {
  apiKey?: string;
  baseURL?: string;
  modelName?: string;
  timeoutMs?: number;
}): ModelGateway {
  // Maintaining backward compatibility for the simple createModelGateway call
  if (!config.apiKey || !config.baseURL || !config.modelName) {
    throw new ModelGatewayError("config_error", "missing primary model configuration");
  }

  return new MultiModelGateway({
    primary: {
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      modelName: config.modelName,
      timeoutMs: config.timeoutMs,
    }
  });
}

export function createMultiProviderGateway(options: ModelGatewayOptions): ModelGateway {
  return new MultiModelGateway(options);
}
