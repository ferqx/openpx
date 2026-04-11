import { describe, expect, test } from "bun:test";
import {
  createModelGateway,
  parsePlannerModelOutput,
  type ModelGatewayEvent,
  type ModelStatus,
} from "../../src/infra/model-gateway";

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

    const events: ModelGatewayEvent[] = [];
    gateway.onEvent((e) => events.push(e));

    try {
      await gateway.plan({ prompt: "test" });
    } catch {
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
    } catch {
      // Expected
    }

    expect(statuses).toContain("thinking");
    expect(statuses).toContain("idle");
  });

  test("parses structured planner output when the model returns a planner envelope", () => {
    const parsed = parsePlannerModelOutput(
      JSON.stringify({
        summary: "Plan startup message work",
        plannerResult: {
          workPackages: [
            {
              id: "pkg_startup_message",
              objective: "Update startup message copy",
              capabilityMarker: "respond_only",
              allowedTools: ["read_file", "apply_patch"],
              inputRefs: ["thread:goal", "file:src/app/main.ts"],
              expectedArtifacts: ["patch:src/app/main.ts"],
            },
          ],
          acceptanceCriteria: ["startup message updated"],
          riskFlags: [],
          approvalRequiredActions: [],
          verificationScope: ["tests/runtime/intake-normalize.test.ts"],
        },
      }),
    );

    expect(parsed.summary).toBe("Plan startup message work");
    expect(parsed.plannerResult?.workPackages[0]?.id).toBe("pkg_startup_message");
    expect(parsed.plannerResult?.workPackages[0]?.capabilityMarker).toBe("respond_only");
  });

  test("falls back to plain summary when planner output is not json", () => {
    const parsed = parsePlannerModelOutput("Plan the work in one package.");
    expect(parsed).toEqual({
      summary: "Plan the work in one package.",
    });
  });
});
