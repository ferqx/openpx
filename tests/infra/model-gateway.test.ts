import { describe, expect, test } from "bun:test";
import { createModelGateway } from "../../src/infra/model-gateway";

describe("createModelGateway", () => {
  test("throws a clear error when OpenAI-style env-backed config is missing", () => {
    expect(() =>
      createModelGateway({
        apiKey: undefined,
        baseURL: "https://example.invalid/v1",
        modelName: "kimi-k2.5",
      }),
    ).toThrow("missing OPENAI_API_KEY");
  });
});
