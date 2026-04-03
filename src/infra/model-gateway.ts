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

export type ModelStatus = "idle" | "thinking" | "responding";

export type ModelGateway = {
  plan(input: PlannerModelInput): Promise<PlannerModelOutput>;
  verify(input: VerifierModelInput): Promise<VerifierModelOutput>;
  onStatusChange(handler: (status: ModelStatus) => void): () => void;
};

export type ModelGatewayErrorKind = 
  | "config_error"
  | "network_error"
  | "provider_error"
  | "rate_limit_error"
  | "timeout_error"
  | "invalid_response_error";

export class ModelGatewayError extends Error {
  constructor(public kind: ModelGatewayErrorKind, message: string, public originalError?: any) {
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

class SingleProviderGateway {
  private model: ChatOpenAI;
  private timeoutMs: number;

  constructor(config: ModelProviderConfig) {
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.model = new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.modelName,
      temperature: 0,
      maxRetries: 0, // We handle retries/failover at the gateway level
      configuration: {
        baseURL: config.baseURL,
      },
    });
  }

  async invoke(messages: any[], onStatus: (status: ModelStatus) => void): Promise<any> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeoutMs);
    const startTime = Date.now();

    try {
      onStatus("thinking");
      const response = await this.model.invoke(messages, { signal: controller.signal });
      onStatus("responding");
      const duration = Date.now() - startTime;
      console.log(`[TELEMETRY] model.invoked: duration=${duration}ms`);
      return response;
    } catch (e: any) {
      const duration = Date.now() - startTime;
      console.error(`[TELEMETRY] model.failed: duration=${duration}ms error=${e.message}`);
      
      if (e.name === "AbortError") {
        throw new ModelGatewayError("timeout_error", `request timed out after ${this.timeoutMs}ms`);
      }
      
      const status = e.status || e.response?.status;
      if (status === 429) {
        throw new ModelGatewayError("rate_limit_error", "rate limit exceeded", e);
      }
      if (status >= 500) {
        throw new ModelGatewayError("provider_error", `provider error: ${status}`, e);
      }
      if (status >= 400) {
        throw new ModelGatewayError("config_error", `invalid request: ${status}`, e);
      }

      throw new ModelGatewayError("network_error", e.message, e);
    } finally {
      clearTimeout(id);
    }
  }
}

class MultiModelGateway implements ModelGateway {
  private providers: SingleProviderGateway[];
  private handlers = new Set<(status: ModelStatus) => void>();

  constructor(options: ModelGatewayOptions) {
    this.providers = [
      new SingleProviderGateway(options.primary),
      ...(options.fallbacks ?? []).map(f => new SingleProviderGateway(f)),
    ];
  }

  onStatusChange(handler: (status: ModelStatus) => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emitStatus(status: ModelStatus) {
    this.handlers.forEach(h => h(status));
  }

  private async tryAllProviders(messages: any[]): Promise<any> {
    let lastError: any;
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      if (!provider) continue;
      
      try {
        if (i > 0) {
          console.warn(`[TELEMETRY] model.failover: switching to fallback provider ${i}`);
        }
        const result = await provider.invoke(messages, s => this.emitStatus(s));
        this.emitStatus("idle");
        return result;
      } catch (e) {
        lastError = e;
        // Only failover on transient errors (network, timeout, rate limit, provider 5xx)
        if (e instanceof ModelGatewayError && e.kind === "config_error") {
          break; // Don't failover on bad config
        }
      }
    }
    this.emitStatus("idle");
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
