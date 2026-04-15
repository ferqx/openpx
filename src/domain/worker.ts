/**
 * @module domain/worker
 * 内部工作单元（worker）领域实体。
 *
 * Worker 表示 run（执行尝试）内承担特定角色的内部工作单元，
 * 例如 planner（规划者）、executor（执行者）、verifier（验证者）、
 * memory_maintainer（记忆维护者）。
 *
 * Worker 是细粒度的执行单元，挂载在 task（具体步骤）之下，
 * 负责 task 的实际执行。它具有独立的生命周期和状态机，
 * 支持 pause（暂停）和 resume（恢复继续执行）。
 *
 * Worker 通过 resumeToken 支持中断后的恢复，与 run 的
 * resume 机制协同工作。
 */
import { z } from "zod";
import { domainError } from "../shared/errors";
import { taskId as sharedTaskId, threadId as sharedThreadId, workerId as sharedWorkerId } from "../shared/ids";
import { workerStatusSchema } from "../shared/schemas";

/** Worker 状态——从 schema 推导，如 created/starting/running/paused/completed/failed/cancelled */
export type WorkerStatus = z.infer<typeof workerStatusSchema>;

/**
 * Worker 角色——内部工作单元的职责分工：
 * - planner——规划者，负责制定执行计划
 * - executor——执行者，负责实际执行操作
 * - verifier——验证者，负责验证执行结果
 * - memory_maintainer——记忆维护者，负责管理记忆条目
 */
export type WorkerRole = "planner" | "executor" | "verifier" | "memory_maintainer";

/**
 * 内部工作单元——run 内承担特定角色的执行单元。
 * 挂载在 task 之下，具有独立的生命周期和状态机，
 * 支持 pause/resume 机制。
 */
export type Worker = {
  /** workerId——内部工作单元唯一标识 */
  workerId: ReturnType<typeof sharedWorkerId>;
  /** threadId——所属协作线标识 */
  threadId: ReturnType<typeof sharedThreadId>;
  /** taskId——所属具体步骤标识 */
  taskId: ReturnType<typeof sharedTaskId>;
  /** role——工作角色，决定该 worker 的职责分工 */
  role: WorkerRole;
  /** spawnReason——创建原因，描述为何需要该 worker */
  spawnReason: string;
  /** status——当前工作状态 */
  status: WorkerStatus;
  /** startedAt——开始执行时间（ISO 8601，可选） */
  startedAt?: string;
  /** endedAt——结束时间（ISO 8601，可选） */
  endedAt?: string;
  /** resumeToken——恢复令牌，用于 interrupt 后的 resume（可选） */
  resumeToken?: string;
};

/**
 * Worker 合法状态转换表——有限状态机约束。
 * - created → starting/cancelled：新建 worker 可启动或取消
 * - starting → running/failed/cancelled：启动中可进入运行或失败
 * - running → paused/completed/failed/cancelled：运行中可暂停、完成或失败
 * - paused → running/failed/cancelled：暂停后可恢复运行
 * 终态（completed/failed/cancelled）不允许任何转换。
 */
const allowedWorkerTransitions: Record<WorkerStatus, readonly WorkerStatus[]> = {
  created: ["starting", "cancelled"],
  starting: ["running", "failed", "cancelled"],
  running: ["paused", "completed", "failed", "cancelled"],
  paused: ["running", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

/**
 * 创建内部工作单元工厂函数。
 * 初始状态为 "created"，由 spawnReason 记录创建原因。
 * resumeToken 用于支持中断后的恢复继续执行。
 */
export function createWorker(input: {
  workerId: string;
  threadId: string;
  taskId: string;
  role: WorkerRole;
  spawnReason: string;
  resumeToken?: string;
}): Worker {
  return {
    workerId: sharedWorkerId(input.workerId),
    threadId: sharedThreadId(input.threadId),
    taskId: sharedTaskId(input.taskId),
    role: input.role,
    spawnReason: input.spawnReason,
    status: "created",
    resumeToken: input.resumeToken,
  };
}

/**
 * 内部工作单元状态转换函数。
 * 校验目标状态是否在合法转换表内，非法转换抛出 domainError；
 * 合法转换返回新的 Worker 对象（不可变更新）。
 *
 * metadata 参数支持在转换时更新 startedAt/endedAt/resumeToken：
 * - startedAt/endedAt 默认保留原值
 * - resumeToken 通过 hasOwnProperty 判断是否显式覆盖，
 *   支持传入 undefined 来清除 token
 */
export function transitionWorker(
  worker: Worker,
  status: WorkerStatus,
  metadata: {
    startedAt?: string;
    endedAt?: string;
    resumeToken?: string | undefined;
  } = {},
): Worker {
  // 同状态不校验转换（幂等场景）
  if (worker.status !== status) {
    const allowedStatuses = allowedWorkerTransitions[worker.status] ?? [];
    if (!allowedStatuses.includes(status)) {
      throw domainError(`invalid worker transition from ${worker.status} to ${status}`);
    }
  }

  // 通过 hasOwnProperty 判断是否显式传入 resumeToken，
  // 区分"未传入"（保留原值）和"传入 undefined"（清除 token）
  const hasResumeTokenOverride = Object.prototype.hasOwnProperty.call(metadata, "resumeToken");

  return {
    ...worker,
    status,
    startedAt: metadata.startedAt ?? worker.startedAt,
    endedAt: metadata.endedAt ?? worker.endedAt,
    resumeToken: hasResumeTokenOverride ? metadata.resumeToken : worker.resumeToken,
  };
}
