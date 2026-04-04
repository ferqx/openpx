import { describe, expect, test } from "bun:test";
import { createThreadNarrativeService } from "../../src/control/context/thread-narrative-service";
import { createControlTask } from "../../src/control/tasks/task-types";

describe("ContextCompression", () => {
  test("compresses stale task context into narrative summaries before thread state grows unbounded", async () => {
    const narrativeService = createThreadNarrativeService({ maxEvents: 2 });
    const threadId = "thread-1";

    // Add 3 tasks
    await narrativeService.processTaskUpdate(createControlTask({
      taskId: "task-1",
      threadId,
      summary: "Task 1 complete",
      status: "completed",
    }));

    await narrativeService.processTaskUpdate(createControlTask({
      taskId: "task-2",
      threadId,
      summary: "Task 2 complete",
      status: "completed",
    }));

    await narrativeService.processTaskUpdate(createControlTask({
      taskId: "task-3",
      threadId,
      summary: "Task 3 complete",
      status: "completed",
    }));

    const narrative = await narrativeService.getNarrative(threadId);
    
    // Should have only 2 latest events, plus a summary of what was dropped
    expect(narrative.events).toHaveLength(2);
    expect(narrative.events[0]!.taskId).toBe("task-2");
    expect(narrative.events[1]!.taskId).toBe("task-3");
    expect(narrative.summary).toContain("Task 1 complete");
    expect(narrative.summary).toContain("Task 2 complete");
    expect(narrative.summary).toContain("Task 3 complete");
  });
});
