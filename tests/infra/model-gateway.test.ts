import { describe, expect, test } from "bun:test";
import {
  createModelGateway,
  parseExecutorModelOutput,
  parsePlannerModelOutput,
  type ModelGatewayEvent,
  type ModelStatus,
} from "../../src/infra/model-gateway";
import { OpenAIChatClient } from "../../src/infra/provider/openai-chat-client";
import { resolveProviderBinding } from "../../src/infra/provider/profile";

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
    // Provider telemetry should also enter the stable event stream
    expect(events.some(e => e.type === "model.telemetry")).toBe(true);
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

  test("parses structured executor tool calls", () => {
    const parsed = parseExecutorModelOutput(
      JSON.stringify({
        summary: "创建登录组件",
        toolCalls: [
          {
            toolCallId: "tool_login_create",
            toolName: "apply_patch",
            action: "create_file",
            path: "components/LoginForm.jsx",
            changedFiles: 1,
            args: {
              content: "export function LoginForm() { return <form />; }\n",
            },
          },
          {
            toolCallId: "tool_test",
            toolName: "exec",
            command: "bun",
            commandArgs: ["test"],
            cwd: ".",
            timeoutMs: 120000,
            args: {
              command: "bun",
              args: ["test"],
              cwd: ".",
            },
          },
        ],
      }),
    );

    expect(parsed.summary).toBe("创建登录组件");
    expect(parsed.toolCalls).toHaveLength(2);
    expect(parsed.toolCalls[0]).toMatchObject({
      toolCallId: "tool_login_create",
      toolName: "apply_patch",
      action: "create_file",
      path: "components/LoginForm.jsx",
    });
    expect(parsed.toolCalls[1]?.commandArgs).toEqual(["test"]);
  });

  test("suppresses telemetry events and usage collection when disabled", async () => {
    const requestUsageFlags: boolean[] = [];
    class StubTransportClient extends OpenAIChatClient {
      override async invoke(input: Parameters<OpenAIChatClient["invoke"]>[0]) {
        requestUsageFlags.push(input.request.requestUsage);
        input.onFirstToken?.(2);
        return {
          content: JSON.stringify({
            summary: "stub-plan",
          }),
          usage: {
            inputTokens: 11,
            outputTokens: 7,
          },
          timing: {
            startedAt: 1,
            firstTokenAt: 2,
            endedAt: 4,
          },
          meta: {
            jsonModeDowngraded: false,
            usageCollectionDowngraded: false,
          },
        };
      }
    }

    const gateway = createModelGateway({
      slots: {
        default: {
          provider: resolveProviderBinding({
            providerId: "openai",
            definition: {
              baseURL: "https://api.openai.com/v1",
              apiKey: "fake-key",
            },
          }),
          name: "gpt-5.4",
        },
        small: {
          provider: resolveProviderBinding({
            providerId: "openai",
            definition: {
              baseURL: "https://api.openai.com/v1",
              apiKey: "fake-key",
            },
          }),
          name: "gpt-5-mini",
        },
      },
      enableTelemetry: false,
      enableCostTracking: false,
      transportClient: new StubTransportClient(),
    });
    const events: ModelGatewayEvent[] = [];
    gateway.onEvent((event) => events.push(event));

    const result = await gateway.plan({ prompt: "test prompt" });

    expect(result.summary).toBe("stub-plan");
    expect(requestUsageFlags).toEqual([false]);
    expect(events.some((event) => event.type === "model.telemetry")).toBe(false);
  });
});
