import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { answerViewSchema } from "../../src/runtime/service/protocol/answer-view";
import { approvalViewSchema } from "../../src/runtime/service/protocol/approval-view";
import { protocolVersionSchema } from "../../src/runtime/service/protocol/protocol-version";
import { runtimeEventSchema } from "../../src/runtime/service/protocol/runtime-event-schema";
import { runtimeSnapshotSchema } from "../../src/runtime/service/protocol/runtime-snapshot-schema";
import { taskViewSchema } from "../../src/runtime/service/protocol/task-view";
import { threadViewSchema } from "../../src/runtime/service/protocol/thread-view";
import { workerViewSchema } from "../../src/runtime/service/protocol/worker-view";

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
      }).status,
    ).toBe("active");

    expect(
      taskViewSchema.parse({
        taskId: "task-1",
        threadId: "thread-1",
        status: "running",
        summary: "Scan project",
      }).status,
    ).toBe("running");

    expect(
      approvalViewSchema.parse({
        approvalRequestId: "approval-1",
        threadId: "thread-1",
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
      threads: [
        {
          threadId: "thread-1",
          workspaceRoot: "/workspace",
          projectId: "project-1",
          revision: 1,
          status: "active",
        },
      ],
      tasks: [
        {
          taskId: "task-1",
          threadId: "thread-1",
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
    expect(parsed.workers[0]?.role).toBe("planner");
  });

  test("protocol version schema accepts only supported versions", () => {
    expect(protocolVersionSchema.safeParse("1.0.0").success).toBe(true);
    expect(protocolVersionSchema.safeParse("2.0.0").success).toBe(false);
  });

  test("stable protocol schemas do not rely on z.any", () => {
    expect(hasZAny(threadViewSchema)).toBe(false);
    expect(hasZAny(taskViewSchema)).toBe(false);
    expect(hasZAny(approvalViewSchema)).toBe(false);
    expect(hasZAny(answerViewSchema)).toBe(false);
    expect(hasZAny(workerViewSchema)).toBe(false);
    expect(hasZAny(runtimeSnapshotSchema)).toBe(false);
  });

  test("runtime events accept known stable event names and reject unknown ones", () => {
    expect(
      runtimeEventSchema.safeParse({
        type: "thread.view_updated",
        payload: {
          threadId: "thread-1",
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
