import { describe, expect, test } from "bun:test";
import { createRun, type Run } from "../../src/domain/run";
import { createControlTask, type ControlTask } from "../../src/control/tasks/task-types";
import { buildPlanDecisionContinuation } from "../../src/harness/core/run-loop/approval-suspension";
import { prepareRootTaskExecution } from "../../src/app/control-plane-run-lifecycle";

describe("control-plane run lifecycle", () => {
  test("resume running state clears stale run blocking reason before background work continues", async () => {
    const threadId = "thread-plan-resume";
    const runId = "run-plan-resume";
    const taskId = "task-plan-resume";
    const blockedRun: Run = {
      ...createRun({
        runId,
        threadId,
        trigger: "user_input",
        inputText: "我要开发一个登录界面",
        activeTaskId: taskId,
        blockingReason: {
          kind: "plan_decision",
          message: "请选择登录界面的实现方案",
        },
      }),
      status: "blocked",
    };
    const blockedTask = createControlTask({
      taskId,
      threadId,
      runId,
      summary: "我要开发一个登录界面",
      status: "blocked",
      blockingReason: {
        kind: "plan_decision",
        message: "请选择登录界面的实现方案",
      },
    });
    const continuation = buildPlanDecisionContinuation({
      threadId,
      runId,
      taskId,
      optionId: "basic",
      optionLabel: "基础登录页",
      input: "按基础登录页方案继续实现。",
    });

    const result = await prepareRootTaskExecution(
      {
        async getLatestRun() {
          return blockedRun;
        },
        async listTasksByThread() {
          return [blockedTask];
        },
        async saveRun(run) {
          return run;
        },
        async updateRunStatus(run, status, patch) {
          return {
            ...run,
            ...patch,
            status,
          };
        },
        async createRootTask() {
          throw new Error("resume 不应创建新的 root task");
        },
        async saveTaskStatus(task, status): Promise<ControlTask> {
          return {
            ...task,
            status,
          };
        },
      },
      threadId,
      continuation,
    );

    expect(result.isResume).toBe(true);
    expect(result.run.status).toBe("running");
    expect(result.run.blockingReason).toBeUndefined();
    expect(result.task.status).toBe("running");
    expect(result.task.blockingReason).toBeUndefined();
  });
});
