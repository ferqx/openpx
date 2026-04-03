import { ChatOpenAI } from "@langchain/openai";
import { domainError } from "../shared/errors";

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

export type ModelGateway = {
  plan(input: PlannerModelInput): Promise<PlannerModelOutput>;
  verify(input: VerifierModelInput): Promise<VerifierModelOutput>;
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

export function createModelGateway(config: {
  apiKey?: string;
  baseURL?: string;
  modelName?: string;
  timeoutMs?: number;
}): ModelGateway {
  if (!config.apiKey) {
    throw new ModelGatewayError("config_error", "missing OPENAI_API_KEY");
  }

  if (!config.baseURL) {
    throw new ModelGatewayError("config_error", "missing OPENAI_BASE_URL");
  }

  if (!config.modelName) {
    throw new ModelGatewayError("config_error", "missing OPENAI_MODEL");
  }

  const timeoutMs = config.timeoutMs ?? 30000;

  const model = new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.modelName,
    temperature: 0,
    maxRetries: 2,
    configuration: {
      baseURL: config.baseURL,
    },
  });

  async function invokeWithTimeout(messages: any[]) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await model.invoke(messages, { signal: controller.signal });
      return response;
    } catch (e: any) {
      if (e.name === "AbortError") {
        throw new ModelGatewayError("timeout_error", `request timed out after ${timeoutMs}ms`);
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

  return {
    async plan(input) {
      const response = await invokeWithTimeout([
        [
          "system",
          "You are the planning worker. Return a concise implementation plan summary."
        ],
        ["human", input.prompt],
      ]);

      const summary = normalizeModelText(response.content);
      if (!summary) {
        throw new ModelGatewayError("invalid_response_error", "model returned an empty response");
      }

      return { summary };
    },

    async verify(input) {
      const response = await invokeWithTimeout([
        [
          "system",
          "You are the verifier. Confirm if the task is complete. Return 'VALID: <summary>' or 'INVALID: <reason>'."
        ],
        ["human", input.prompt],
      ]);

      const text = normalizeModelText(response.content);
      if (!text) {
        throw new ModelGatewayError("invalid_response_error", "model returned an empty response");
      }

      const isValid = text.toUpperCase().startsWith("VALID");
      const summary = text.replace(/^(VALID|INVALID):\s*/i, "");

      return { summary, isValid };
    },
  };
}
