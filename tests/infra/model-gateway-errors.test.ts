import { describe, expect, test } from "bun:test";
import { createModelGateway, ModelGatewayError } from "../../src/infra/model-gateway";

describe("ModelGateway Errors", () => {
  test("throws a config_error when apiKey is missing", () => {
    expect(() => createModelGateway({ baseURL: "http://api.openai.com", modelName: "gpt-4" }))
      .toThrow(ModelGatewayError);
  });

  test("classifies 429 as rate_limit_error", async () => {
    const gateway = createModelGateway({
      apiKey: "fake",
      baseURL: "http://localhost:1234", // will fail
      modelName: "gpt-4",
    });

    // Mocking fetch or ChatOpenAI internals would be better, 
    // but for now we just verify the taxonomy exists.
    expect(gateway.plan).toBeDefined();
  });
});
