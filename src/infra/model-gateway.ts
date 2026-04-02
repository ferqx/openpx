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

export type ModelGateway = {
  plan(input: PlannerModelInput): Promise<PlannerModelOutput>;
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

export function createModelGateway(config: {
  apiKey?: string;
  baseURL?: string;
  modelName?: string;
}): ModelGateway {
  if (!config.apiKey) {
    throw domainError("missing OPENAI_API_KEY for planner model gateway");
  }

  if (!config.baseURL) {
    throw domainError("missing OPENAI_BASE_URL for planner model gateway");
  }

  if (!config.modelName) {
    throw domainError("missing OPENAI_MODEL for planner model gateway");
  }

  const model = new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.modelName,
    temperature: 0,
    maxRetries: 1,
    configuration: {
      baseURL: config.baseURL,
    },
  });

  return {
    async plan(input) {
      const response = await model.invoke([
        [
          "system",
          [
            "You are the planning worker in an agent OS.",
            "Return a concise implementation plan summary for the user's request.",
            "Do not use markdown bullets.",
            "Keep it to 1-3 sentences and make it actionable.",
          ].join(" "),
        ],
        ["human", input.prompt],
      ]);

      const summary = normalizeModelText(response.content);
      if (!summary) {
        throw domainError("planner model returned an empty response");
      }

      return { summary };
    },
  };
}
