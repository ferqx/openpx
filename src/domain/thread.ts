/**
 * @module domain/thread
 * 协作线（thread）领域实体。
 *
 * Thread 表示一条长期协作线。它负责承载 workspace/project 归属、
 * durable narrative（持久叙事）以及跨多个 run（执行尝试）持续存在的上下文。
 *
 * Thread 是系统最顶层的执行上下文容器，run 和 task 均挂载在 thread 之下。
 * Thread 通过 DerivedThreadView（投影视图 / projected view）与
 * 控制面（control plane）的压缩策略协作，实现叙事摘要与上下文管理。
 *
 * Thread 具有有限状态机语义，通过 allowedThreadTransitions 约束合法的状态转换。
 */
import { threadId as sharedThreadId } from "../shared/ids";
import { domainError } from "../shared/errors";
import { threadStatusSchema } from "../shared/schemas";
import type { DerivedThreadView } from "../control/context/thread-compaction-types";
import { z } from "zod";

/** Thread 状态——从 schema 推导，如 active/idle/archived */
export type ThreadStatus = z.infer<typeof threadStatusSchema>;

/**
 * 协作线——系统最顶层的执行上下文容器。
 * 承载 workspace/project 归属、持久叙事和跨 run 持续存在的上下文。
 * 通过 DerivedThreadView（投影视图）与控制面压缩策略协作。
 */
export type Thread = {
  /** threadId——协作线唯一标识 */
  threadId: ReturnType<typeof sharedThreadId>;
  /** workspaceRoot——工作区根路径 */
  workspaceRoot: string;
  /** projectId——项目标识 */
  projectId: string;
  /** revision——协作线版本号，每次状态变更递增 */
  revision: number;
  /** status——当前协作线状态 */
  status: ThreadStatus;
  /** recommendationReason——推荐原因（可选，用于智能推荐场景） */
  recommendationReason?: string;
  /** narrativeSummary——叙事摘要，由控制面压缩策略生成（可选） */
  narrativeSummary?: string;
  /** narrativeRevision——叙事摘要对应的版本号（可选） */
  narrativeRevision?: number;
} & DerivedThreadView;

/**
 * Thread 合法状态转换表——有限状态机约束。
 * - active → idle/archived：活跃协作线可转空闲或归档
 * - idle → active/archived：空闲协作线可重新激活或归档
 * - archived → active：归档协作线可重新激活
 */
const allowedThreadTransitions: Record<ThreadStatus, readonly ThreadStatus[]> = {
  active: ["idle", "archived"],
  idle: ["active", "archived"],
  archived: ["active"],
};

/**
 * 创建协作线工厂函数。
 * 初始状态为 "active"，版本号为 1。
 * workspaceRoot 和 projectId 默认为空字符串，由调用方按需设置。
 */
export function createThread(threadId: string, workspaceRoot: string = "", projectId: string = ""): Thread {
  return {
    threadId: sharedThreadId(threadId),
    workspaceRoot,
    projectId,
    revision: 1,
    status: "active",
  };
}

/**
 * 协作线状态转换函数。
 * 校验目标状态是否在合法转换表内，非法转换抛出 domainError；
 * 合法转换返回新的 Thread 对象（不可变更新）。
 */
export function transitionThread(thread: Thread, status: ThreadStatus): Thread {
  const allowedStatuses = allowedThreadTransitions[thread.status] ?? [];

  if (!allowedStatuses.includes(status)) {
    throw domainError(`invalid thread transition from ${thread.status} to ${status}`);
  }

  return { ...thread, status };
}
