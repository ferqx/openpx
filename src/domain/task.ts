/**
 * @module domain/task
 * 具体步骤（task）领域实体。
 *
 * Task 表示 run（执行尝试）内的当前具体步骤。它只描述"现在在做什么"，
 * 例如计划、执行、验证或等待人工恢复，而不是承载整条 thread（协作线）历史。
 *
 * Task 具有有限状态机语义，通过 allowedTaskTransitions 约束合法的状态转换。
 * 阻塞原因与 run 共享 kind 定义，确保跨层语义一致。
 */
import { domainError } from "../shared/errors";
import { runId as sharedRunId, taskId as sharedTaskId, threadId as sharedThreadId } from "../shared/ids";
import { taskStatusSchema } from "../shared/schemas";
import { z } from "zod";

/** Task 状态——从 schema 推导，如 queued/running/blocked/completed/failed/cancelled */
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/**
 * 具体步骤——run 内的当前执行步骤。
 * 只描述"现在在做什么"，不承载整条 thread 历史。
 * 阻塞原因与 RunBlockingReason 共享 kind 语义。
 */
export type Task = {
  /** taskId——具体步骤唯一标识 */
  taskId: ReturnType<typeof sharedTaskId>;
  /** threadId——所属协作线标识 */
  threadId: ReturnType<typeof sharedThreadId>;
  /** runId——所属执行尝试标识 */
  runId: ReturnType<typeof sharedRunId>;
  /** summary——步骤摘要，描述当前正在做什么（可选） */
  summary?: string;
  /** status——当前步骤状态 */
  status: TaskStatus;
  /** blockingReason——阻塞原因，与 run 共享 kind 语义（可选） */
  blockingReason?: {
    kind: "waiting_approval" | "human_recovery";
    message: string;
  };
};

/**
 * Task 合法状态转换表——有限状态机约束。
 * 确保 transitionTask 只允许合法的状态跳转，
 * 非法转换会抛出 domainError。
 * 终态（completed/failed/cancelled）不允许任何转换。
 */
const allowedTaskTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  queued: ["running", "blocked", "completed", "failed", "cancelled"],
  running: ["blocked", "completed", "failed", "cancelled"],
  blocked: ["running", "completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

/**
 * 创建具体步骤工厂函数（重载1：无 runId）。
 * 当调用方不提供 runId 时，自动回退到 taskId 作为 runId，
 * 适用于单步骤场景。
 */
export function createTask(taskId: string, threadId: string, summary?: string): Task;

/**
 * 创建具体步骤工厂函数（重载2：含 runId）。
 * 显式指定 runId，适用于多步骤的 run 场景。
 */
export function createTask(taskId: string, threadId: string, runId: string, summary?: string): Task;

/**
 * 创建具体步骤工厂函数（实现）。
 * 通过参数重载支持有无 runId 的两种调用方式：
 * - 三参数时：runIdOrSummary 被视为 summary，runId 回退到 taskId
 * - 四参数时：runIdOrSummary 被视为 runId，summary 独立传入
 * 初始状态为 "queued"。
 */
export function createTask(taskId: string, threadId: string, runIdOrSummary?: string, summary?: string): Task {
  // 三参数调用时，runId 回退到 taskId；四参数调用时，使用显式 runId
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

/**
 * 具体步骤状态转换函数。
 * 校验目标状态是否在合法转换表内，非法转换抛出 domainError；
 * 合法转换返回新的 Task 对象（不可变更新）。
 */
export function transitionTask(task: Task, status: TaskStatus): Task {
  const allowedStatuses = allowedTaskTransitions[task.status] ?? [];

  if (!allowedStatuses.includes(status)) {
    throw domainError(`invalid task transition from ${task.status} to ${status}`);
  }

  return { ...task, status };
}
