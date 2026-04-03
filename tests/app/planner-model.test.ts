import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";

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
      onStatusChange() {
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

    expect(result.status).toBe("completed");
    expect(result.summary).toContain("plan the repo architecture");
  });
});
