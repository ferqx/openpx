import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";
import { createThread } from "../../src/domain/thread";

describe("planner model integration", () => {
  test("routes planner work through the injected model gateway", async () => {
    const modelGateway = {
      async plan(input: { prompt: string }) {
        return {
          summary: `model summary for: ${input.prompt}`,
        };
      },
      async verify() {
        return { summary: "verified", isValid: true };
      },
      async respond() {
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const ctx = await createAppContext({
      workspaceRoot: "/tmp/planner-workspace",
      dataDir: ":memory:",
      modelGateway,
    });

    const result = await ctx.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "plan the repo architecture" },
    });

    expect(result.status).toBe("active");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const hydrated = await ctx.kernel.hydrateSession();
    expect(hydrated?.status).toBe("completed");
  });

  test("continues into execution when the planner model returns work packages", async () => {
    const modelGateway = {
      async plan() {
        return {
          summary: "planned startup message work",
          plannerResult: {
            workPackages: [
              {
                id: "pkg_startup_message",
                objective: "Update startup message copy",
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
        };
      },
      async verify() {
        return { summary: "verified", isValid: true };
      },
      async respond() {
        return { summary: "responded" };
      },
      onStatusChange() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };

    const workspaceRoot = "/tmp/planner-workspace-exec";
    const ctx = await createAppContext({
      workspaceRoot,
      dataDir: ":memory:",
      modelGateway,
    });
    const thread = createThread("thread-plan-exec", workspaceRoot, ctx.config.projectId);
    await ctx.stores.threadStore.save(thread);

    const result = await ctx.controlPlane.startRootTask(thread.threadId, "make startup copy nicer");

    expect(result.status).toBe("completed");
    expect(result.summary).toBe("Executed request: Update startup message copy");
  });
});
