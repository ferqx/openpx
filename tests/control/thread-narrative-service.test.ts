import { describe, expect, test } from "bun:test";
import { createThreadNarrativeService } from "../../src/control/context/thread-narrative-service";
import { createControlTask } from "../../src/control/tasks/task-types";

describe("ThreadNarrativeService", () => {
  test("promotes only stable task outputs into thread narrative state", async () => {
    const narrativeService = createThreadNarrativeService();
    const threadId = "thread-1";

    const completedTask = createControlTask({
      taskId: "task-1",
      threadId,
      summary: "User successfully authenticated",
      status: "completed",
    });

    const runningTask = createControlTask({
      taskId: "task-2",
      threadId,
      summary: "Attempting to connect to database...",
      status: "running",
    });

    await narrativeService.processTaskUpdate(completedTask);
    await narrativeService.processTaskUpdate(runningTask);

    const narrative = await narrativeService.getNarrative(threadId);
    expect(narrative.events.some(e => e.summary === "User successfully authenticated")).toBe(true);
    expect(narrative.events.some(e => e.summary === "Attempting to connect to database...")).toBe(false);
  });

  test("maintains a curated history of stable task outcomes", async () => {
    const narrativeService = createThreadNarrativeService();
    const threadId = "thread-1";

    await narrativeService.processTaskUpdate(createControlTask({
      taskId: "task-1",
      threadId,
      summary: "Step 1: Done",
      status: "completed",
    }));

    await narrativeService.processTaskUpdate(createControlTask({
      taskId: "task-2",
      threadId,
      summary: "Step 2: Done",
      status: "completed",
    }));

    const narrative = await narrativeService.getNarrative(threadId);
    expect(narrative.events).toHaveLength(2);
    expect(narrative.events[0]!.summary).toBe("Step 1: Done");
    expect(narrative.events[1]!.summary).toBe("Step 2: Done");
  });
});
