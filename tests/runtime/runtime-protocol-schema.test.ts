import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { answerViewSchema } from "../../src/harness/protocol/views/answer-view";
import { approvalViewSchema } from "../../src/harness/protocol/views/approval-view";
import { protocolVersionSchema } from "../../src/harness/protocol/schemas/protocol-version";
import { runtimeEventSchema } from "../../src/harness/protocol/events/runtime-event-schema";
import { runViewSchema } from "../../src/harness/protocol/views/run-view";
import { runtimeSnapshotSchema } from "../../src/harness/protocol/views/runtime-snapshot-schema";
import { taskViewSchema } from "../../src/harness/protocol/views/task-view";
import { threadViewSchema } from "../../src/harness/protocol/views/thread-view";
import { workerViewSchema } from "../../src/harness/protocol/views/worker-view";

function hasZAny(value: unknown): boolean {
  if (value instanceof z.ZodAny) {
    return true;
  }

  if (value instanceof z.ZodObject) {
    return Object.values(value.shape).some((item) => hasZAny(item));
  }

  if (value instanceof z.ZodOptional || value instanceof z.ZodNullable || value instanceof z.ZodDefault) {
    return hasZAny(value.unwrap());
  }

  if (value instanceof z.ZodArray) {
    return hasZAny(value.element);
  }

  if (value instanceof z.ZodUnion) {
    return value.options.some((option) => hasZAny(option));
  }

  return false;
}

describe("runtime protocol schemas", () => {
  test("parse minimal stable runtime view objects", () => {
    expect(
      threadViewSchema.parse({
        threadId: "thread-1",
        workspaceRoot: "/workspace",
        projectId: "project-1",
        revision: 1,
        status: "active",
        threadMode: "normal",
        activeRunId: "run-1",
      }).status,
    ).toBe("active");

    expect(
      runViewSchema.parse({
        runId: "run-1",
        threadId: "thread-1",
        status: "running",
        trigger: "user_input",
        startedAt: new Date().toISOString(),
      }).status,
    ).toBe("running");

    expect(
      taskViewSchema.parse({
        taskId: "task-1",
        threadId: "thread-1",
        runId: "run-1",
        status: "running",
        summary: "Scan project",
      }).status,
    ).toBe("running");

    expect(
      approvalViewSchema.parse({
        approvalRequestId: "approval-1",
        threadId: "thread-1",
        runId: "run-1",
        taskId: "task-1",
        toolCallId: "tool-1",
        summary: "apply_patch update src/app.ts",
        risk: "apply_patch.medium",
        status: "pending",
      }).status,
    ).toBe("pending");

    expect(
      answerViewSchema.parse({
        answerId: "answer-1",
        threadId: "thread-1",
        content: "Completed.",
      }).content,
    ).toBe("Completed.");

    expect(
      workerViewSchema.parse({
        workerId: "worker-1",
        threadId: "thread-1",
        taskId: "task-1",
        role: "planner",
        status: "running",
        spawnReason: "initial planning",
      }).status,
    ).toBe("running");
  });

  test("runtime snapshot includes stable worker views", () => {
    const parsed = runtimeSnapshotSchema.parse({
      protocolVersion: "1.0.0",
      workspaceRoot: "/workspace",
      projectId: "project-1",
      lastEventSeq: 7,
      activeThreadId: "thread-1",
      activeRunId: "run-1",
      threadMode: "plan",
      threads: [
        {
          threadId: "thread-1",
          workspaceRoot: "/workspace",
          projectId: "project-1",
          revision: 1,
          status: "active",
          threadMode: "plan",
          activeRunId: "run-1",
        },
      ],
      runs: [
        {
          runId: "run-1",
          threadId: "thread-1",
          status: "running",
          trigger: "user_input",
          startedAt: new Date().toISOString(),
        },
      ],
      tasks: [
        {
          taskId: "task-1",
          threadId: "thread-1",
          runId: "run-1",
          status: "running",
          summary: "Scan project",
        },
      ],
      pendingApprovals: [],
      answers: [],
      workers: [
        {
          workerId: "worker-1",
          threadId: "thread-1",
          taskId: "task-1",
          role: "planner",
          status: "running",
          spawnReason: "initial planning",
        },
      ],
    });

    expect(parsed.workers).toHaveLength(1);
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.threadMode).toBe("plan");
    expect(parsed.threads[0]?.threadMode).toBe("plan");
    expect(parsed.workers[0]?.role).toBe("planner");
  });

  test("protocol version schema accepts only supported versions", () => {
    expect(protocolVersionSchema.safeParse("1.0.0").success).toBe(true);
    expect(protocolVersionSchema.safeParse("2.0.0").success).toBe(false);
  });

  test("stable protocol schemas do not rely on z.any", () => {
    expect(hasZAny(threadViewSchema)).toBe(false);
    expect(hasZAny(runViewSchema)).toBe(false);
    expect(hasZAny(taskViewSchema)).toBe(false);
    expect(hasZAny(approvalViewSchema)).toBe(false);
    expect(hasZAny(answerViewSchema)).toBe(false);
    expect(hasZAny(workerViewSchema)).toBe(false);
    expect(hasZAny(runtimeSnapshotSchema)).toBe(false);
  });

  test("runtime events accept known stable event names and reject unknown ones", () => {
    expect(
      runtimeEventSchema.safeParse({
        type: "thread.mode_changed",
        payload: {
          threadId: "thread-1",
          fromMode: "normal",
          toMode: "plan",
          trigger: "slash_command",
        },
      }).success,
    ).toBe(true);

    expect(
      runtimeEventSchema.safeParse({
        type: "thread.view_updated",
        payload: {
          threadId: "thread-1",
          threadMode: "normal",
          recoveryFacts: {
            threadId: "thread-1",
            revision: 2,
            schemaVersion: 1,
            status: "completed",
            updatedAt: new Date().toISOString(),
            pendingApprovals: [],
            conversationHistory: [
              {
                messageId: "message-1",
                role: "user",
                content: "hello",
                createdAt: new Date().toISOString(),
              },
              {
                messageId: "message-2",
                role: "assistant",
                content: "hi",
                createdAt: new Date().toISOString(),
              },
            ],
          },
          status: "active",
        },
      }).success,
    ).toBe(true);

    expect(
      runtimeEventSchema.safeParse({
        type: "model.status",
        payload: {
          status: "thinking",
        },
      }).success,
    ).toBe(true);

    expect(
      runtimeEventSchema.safeParse({
        type: "model.telemetry",
        payload: {
          providerId: "openai",
          baseURL: "https://api.openai.com/v1",
          model: "gpt-5.4",
          operation: "plan",
          inputTokens: 10,
          outputTokens: 20,
          waitDuration: 30,
          genDuration: 40,
          totalDuration: 70,
          status: "completed",
          fallbackCount: 0,
        },
      }).success,
    ).toBe(true);

    expect(
      runtimeEventSchema.safeParse({
        type: "thread.view_updated",
        payload: {
          threadId: "thread-1",
        },
      }).success,
    ).toBe(false);

    expect(
      runtimeEventSchema.safeParse({
        type: "model.status",
        payload: {
          status: "busy",
        },
      }).success,
    ).toBe(false);

    expect(
      runtimeEventSchema.safeParse({
        type: "test",
      }).success,
    ).toBe(false);
  });
});
