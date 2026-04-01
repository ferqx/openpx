import { describe, expect, test } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";

describe("createAppContext", () => {
  test("builds a local sqlite-backed app context", async () => {
    const ctx = await createAppContext({
      workspaceRoot: "/tmp/demo-workspace",
      dataDir: ":memory:",
    });

    expect(ctx.config.workspaceRoot).toBe("/tmp/demo-workspace");
    expect(ctx.config.checkpointConnString).toBe(":memory:");
    expect(typeof ctx.kernel.handleCommand).toBe("function");
  });
});
