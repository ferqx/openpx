import { domainError } from "../shared/errors";
import { runId as sharedRunId, taskId as sharedTaskId, threadId as sharedThreadId } from "../shared/ids";
import { taskStatusSchema } from "../shared/schemas";
import { z } from "zod";

export type TaskStatus = z.infer<typeof taskStatusSchema>;

// Task 表示 run 内的当前具体步骤。它应该只描述“现在在做什么”，
// 例如计划、执行、验证或等待人工恢复，而不是承载整条 thread 历史。
export type Task = {
  taskId: ReturnType<typeof sharedTaskId>;
  threadId: ReturnType<typeof sharedThreadId>;
  runId: ReturnType<typeof sharedRunId>;
  summary?: string;
  status: TaskStatus;
  blockingReason?: {
    kind: "waiting_approval" | "human_recovery";
    message: string;
  };
};

const allowedTaskTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  queued: ["running", "blocked", "completed", "failed", "cancelled"],
  running: ["blocked", "completed", "failed", "cancelled"],
  blocked: ["running", "completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function createTask(taskId: string, threadId: string, summary?: string): Task;
export function createTask(taskId: string, threadId: string, runId: string, summary?: string): Task;
export function createTask(taskId: string, threadId: string, runIdOrSummary?: string, summary?: string): Task {
  const resolvedRunId = summary === undefined ? taskId : runIdOrSummary ?? taskId;
  const resolvedSummary = summary === undefined ? runIdOrSummary : summary;

  return {
    taskId: sharedTaskId(taskId),
    threadId: sharedThreadId(threadId),
    runId: sharedRunId(resolvedRunId),
    summary: resolvedSummary,
    status: "queued",
  };
}

export function transitionTask(task: Task, status: TaskStatus): Task {
  const allowedStatuses = allowedTaskTransitions[task.status] ?? [];

  if (!allowedStatuses.includes(status)) {
    throw domainError(`invalid task transition from ${task.status} to ${status}`);
  }

  return { ...task, status };
}
