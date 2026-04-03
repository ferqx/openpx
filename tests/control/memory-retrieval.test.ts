import { describe, expect, test, mock } from "bun:test";
import { createAppContext } from "../../src/app/bootstrap";
import { createMemoryRecord } from "../../src/domain/memory";

describe("Memory Retrieval", () => {
  test("planner retrieves and includes project memory in the prompt", async () => {
    let capturedPrompt = "";
    const mockGateway: any = {
      plan: mock(async ({ prompt }: { prompt: string }) => {
        capturedPrompt = prompt;
        return { summary: "planned" };
      }),
      verify: mock(async () => ({ summary: "verified", isValid: true })),
      onStatusChange: mock(() => () => {}),
    };

    const context = await createAppContext({
      dataDir: ":memory:",
      workspaceRoot: "/tmp/test",
      modelGateway: mockGateway,
    });

    // 1. Seed some project memory
    await context.stores.memoryStore.save(createMemoryRecord({
      memoryId: "mem-1",
      namespace: "project",
      key: "arch",
      value: "Use React for the frontend",
      threadId: "t1",
    }));

    // 2. Trigger planning
    await context.kernel.handleCommand({
      type: "submit_input",
      payload: { text: "plan start new feature" },
    });

    // 3. Verify prompt contains memory
    expect(capturedPrompt).toContain("Project Memory:");
    expect(capturedPrompt).toContain("Use React for the frontend");
    expect(capturedPrompt).toContain("plan start new feature");
  });
});
