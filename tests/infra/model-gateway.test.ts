import { describe, expect, test, mock } from "bun:test";
import { createModelGateway, type ModelStatus } from "../../src/infra/model-gateway";

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

  test("emits status changes during plan", async () => {
    // We'll mock the ChatOpenAI inside model-gateway or just test that it calls onStatusChange
    // Since we don't want to mock internal LangChain components here if possible, 
    // let's just check the structure.
    const gateway = createModelGateway({
      apiKey: "fake",
      baseURL: "https://example.invalid/v1",
      modelName: "kimi-k2.5",
      timeoutMs: 100,
    });

    const statuses: ModelStatus[] = [];
    gateway.onStatusChange((s) => statuses.push(s));

    try {
      await gateway.plan({ prompt: "test" });
    } catch (e) {
      // Expected to fail because of fake URL
    }

    // Should at least have 'thinking' and 'idle'
    expect(statuses).toContain("thinking");
    expect(statuses).toContain("idle");
  });
});
