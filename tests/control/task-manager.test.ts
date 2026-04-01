import { describe, expect, test } from "bun:test";
import { createTaskManager } from "../../src/control/tasks/task-manager";

describe("TaskManager", () => {
  test("creates a root task in queued state", async () => {
    const savedTasks: Array<{
      taskId: string;
      threadId: string;
      summary: string;
      status: string;
    }> = [];
    const appendedEvents: Array<{ type: string; threadId: string; payload?: Record<string, unknown> }> = [];
    const manager = createTaskManager({
      taskStore: {
        async save(task) {
          savedTasks.push(task);
        },
      },
      eventLog: {
        async append(event) {
          appendedEvents.push(event);
        },
      },
    });

    const task = await manager.createRootTask("thread_1", "plan repo");

    expect(task.status).toBe("queued");
    expect(task.threadId).toBe("thread_1");
    expect(task.summary).toBe("plan repo");
    expect(task.taskId).toStartWith("task_");
    expect(savedTasks).toEqual([task]);
    expect(appendedEvents).toHaveLength(1);
    expect(appendedEvents[0]).toMatchObject({
      threadId: "thread_1",
      type: "task.created",
      payload: {
        taskId: task.taskId,
        summary: "plan repo",
        status: "queued",
      },
    });
  });
});
