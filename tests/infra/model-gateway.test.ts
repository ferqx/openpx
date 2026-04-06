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
    ).toThrow("missing primary model configuration");
  });

  test("emits performance events during plan", async () => {
    const gateway = createModelGateway({
      apiKey: "fake",
      baseURL: "https://example.invalid/v1",
      modelName: "kimi-k2.5",
      timeoutMs: 100,
    });

    const events: any[] = [];
    gateway.onEvent((e) => events.push(e));

    try {
      await gateway.plan({ prompt: "test" });
    } catch (e) {
      // Expected to fail because of fake URL
    }

    // Should have started the invocation
    expect(events.some(e => e.type === "model.invocation_started")).toBe(true);
    // Should have a failed event if the URL is fake
    expect(events.some(e => e.type === "model.failed")).toBe(true);
  });

  test("emits status changes and performance metrics", async () => {
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
      // Expected
    }

    expect(statuses).toContain("thinking");
    expect(statuses).toContain("idle");
  });
});
