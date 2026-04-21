/**
 * @module domain/run
 * 执行尝试（run）领域实体。
 *
 * Run 表示 thread（协作线）内的一次执行尝试。它负责记录这一次尝试的状态、
 * 触发方式、当前 activeTask，以及等待 approval（审批）或恢复阻塞的原因。
 *
 * Run 具有有限状态机语义，通过 allowedRunTransitions 约束合法的状态转换，
 * 确保执行生命周期不会出现非法跳转。
 *
 * RunLedgerState 用于记录运行时的工具调用账本状态，
 * 支持 interrupt（中断）后的 resume（恢复继续执行）。
 */
import { domainError } from "../shared/errors";
import { runId as sharedRunId, threadId as sharedThreadId } from "../shared/ids";
import { runStatusSchema, runTriggerSchema } from "../shared/schemas";
import { z } from "zod";

/** Run 状态——从 schema 推导，如 created/running/waiting_approval/blocked/completed/failed/interrupted */
export type RunStatus = z.infer<typeof runStatusSchema>;
/** Run 触发方式——从 schema 推导，如 manual/auto/resume 等 */
export type RunTrigger = z.infer<typeof runTriggerSchema>;

/**
 * Run 阻塞原因——描述 run 为何暂停执行。
 * - waiting_approval：等待审批（approval）通过
 * - plan_decision：等待用户选择 planner（规划器）提供的实现方案
 * - human_recovery：需要人工恢复继续执行（resume）
 * - environment_block：环境阻塞（如外部依赖不可用）
 */
export type RunBlockingReason = {
  kind: "waiting_approval" | "plan_decision" | "human_recovery" | "environment_block";
  message: string;
};

/**
 * Run 账本状态——记录运行时的工具调用进度。
 * 用于 interrupt（中断）后的 resume（恢复继续执行）场景，
 * 确保能从正确的工具调用位置继续推进。
 */
export type RunLedgerState = {
  /** lastCompletedToolCallId——最近完成的工具调用标识 */
  lastCompletedToolCallId?: string;
  /** pendingToolCallId——正在等待结果的工具调用标识 */
  pendingToolCallId?: string;
};

/**
 * 执行尝试——thread 内的一次执行尝试。
 * 记录状态、触发方式、当前 activeTask、阻塞原因和账本状态，
 * 是运行时调度的核心领域对象。
 */
export type Run = {
  /** runId——执行尝试唯一标识 */
  runId: ReturnType<typeof sharedRunId>;
  /** threadId——所属协作线标识 */
  threadId: ReturnType<typeof sharedThreadId>;
  /** status——当前执行状态 */
  status: RunStatus;
  /** trigger——触发方式，如手动触发、自动触发、恢复触发 */
  trigger: RunTrigger;
  /** inputText——本次执行的输入文本（可选） */
  inputText?: string;
  /** activeTaskId——当前活跃的 task 标识（可选） */
  activeTaskId?: string;
  /** startedAt——开始时间（ISO 8601） */
  startedAt: string;
  /** endedAt——结束时间（ISO 8601），未结束时为 undefined */
  endedAt?: string;
  /** resultSummary——执行结果摘要（可选） */
  resultSummary?: string;
  /** resumeToken——恢复令牌，用于 interrupt 后的 resume（可选） */
  resumeToken?: string;
  /** blockingReason——阻塞原因，解释为何 run 暂停（可选） */
  blockingReason?: RunBlockingReason;
  /** ledgerState——账本状态，记录工具调用进度（可选） */
  ledgerState?: RunLedgerState;
};

/**
 * Run 合法状态转换表——有限状态机约束。
 * 确保 transitionRun 只允许合法的状态跳转，
 * 非法转换会抛出 domainError。
 */
const allowedRunTransitions: Record<RunStatus, readonly RunStatus[]> = {
  created: ["running", "interrupted", "completed", "failed"],
  running: ["waiting_approval", "blocked", "completed", "failed", "interrupted"],
  waiting_approval: ["running", "blocked", "completed", "failed", "interrupted"],
  blocked: ["running", "completed", "failed", "interrupted"],
  completed: [],
  failed: [],
  interrupted: ["running", "completed", "failed"],
};

/**
 * 创建执行尝试工厂函数。
 * 初始状态为 "created"，trigger 通过 schema 校验确保合法性，
 * startedAt 默认取当前时间。
 */
export function createRun(input: {
  runId: string;
  threadId: string;
  trigger: RunTrigger;
  inputText?: string;
  activeTaskId?: string;
  startedAt?: string;
  endedAt?: string;
  resultSummary?: string;
  resumeToken?: string;
  blockingReason?: RunBlockingReason;
  ledgerState?: RunLedgerState;
}): Run {
  return {
    runId: sharedRunId(input.runId),
    threadId: sharedThreadId(input.threadId),
    status: "created",
    trigger: runTriggerSchema.parse(input.trigger),
    inputText: input.inputText,
    activeTaskId: input.activeTaskId,
    startedAt: input.startedAt ?? new Date().toISOString(),
    endedAt: input.endedAt,
    resultSummary: input.resultSummary,
    resumeToken: input.resumeToken,
    blockingReason: input.blockingReason,
    ledgerState: input.ledgerState,
  };
}

/**
 * 执行尝试状态转换函数。
 * 校验目标状态是否在合法转换表内，非法转换抛出 domainError；
 * 合法转换返回新的 Run 对象（不可变更新）。
 */
export function transitionRun(run: Run, status: RunStatus): Run {
  const allowedStatuses = allowedRunTransitions[run.status] ?? [];

  if (!allowedStatuses.includes(status)) {
    throw domainError(`invalid run transition from ${run.status} to ${status}`);
  }

  return { ...run, status };
}
