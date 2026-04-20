import { z } from "zod";
import { domainError } from "../shared/errors";
import { agentRunId as sharedAgentRunId, taskId as sharedTaskId, threadId as sharedThreadId } from "../shared/ids";
import { agentRunStatusSchema } from "../shared/schemas";

/** AgentRun 生命周期状态：created/starting/running/paused/completed/failed/cancelled。 */
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

/**
 * AgentRun runtime role——底层运行时角色字面量。
 *
 * 当前仍保留 planner / executor / verifier / memory_maintainer，
 * 但它们只表示内部执行分工，不等于产品层 agent 身份。
 */
export type AgentRunRuntimeRole = "planner" | "executor" | "verifier" | "memory_maintainer";

/** AgentRun 角色层级：区分产品主代理、子代理、系统代理与 legacy_internal 内部实例。 */
export type AgentRunRoleKind = "primary" | "subagent" | "system" | "legacy_internal";

/** AgentRun 可见性策略：决定 surface 是否默认展示该运行实例。 */
export type AgentRunVisibilityPolicy = "hidden" | "visible_when_instance";

/** AgentRunRecord——内部持久化与生命周期记录。 */
export type AgentRunRecord = {
  /** agentRunId——运行实例唯一标识。 */
  agentRunId: ReturnType<typeof sharedAgentRunId>;
  /** threadId——所属协作线标识。 */
  threadId: ReturnType<typeof sharedThreadId>;
  /** taskId——所属具体步骤标识。 */
  taskId: ReturnType<typeof sharedTaskId>;
  /** role——底层 runtime 角色分工。 */
  role: AgentRunRuntimeRole;
  /** spawnReason——创建原因。 */
  spawnReason: string;
  /** status——当前生命周期状态。 */
  status: AgentRunStatus;
  /** startedAt——开始时间（ISO 8601，可选）。 */
  startedAt?: string;
  /** endedAt——结束时间（ISO 8601，可选）。 */
  endedAt?: string;
  /** resumeToken——恢复令牌，用于中断后的继续执行。 */
  resumeToken?: string;
};

/**
 * AgentRun——对外正式运行实例语义。
 *
 * 它在 AgentRunRecord 的生命周期事实之上，补充 roleKind/roleId 等
 * 产品层可读语义，供 protocol、surface 和文档使用。
 */
export type AgentRun = {
  agentRunId: string;
  threadId: string;
  taskId: string;
  roleKind: AgentRunRoleKind;
  roleId: string;
  status: AgentRunStatus;
  spawnReason: string;
  goalSummary: string;
  inputSummary?: string;
  outputSummary?: string;
  visibilityPolicy: AgentRunVisibilityPolicy;
  resumeToken?: string;
  startedAt?: string;
  endedAt?: string;
};

const allowedAgentRunTransitions: Record<AgentRunStatus, readonly AgentRunStatus[]> = {
  created: ["starting", "cancelled"],
  starting: ["running", "failed", "cancelled"],
  running: ["paused", "completed", "failed", "cancelled"],
  paused: ["running", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

/** 创建 AgentRunRecord，初始状态固定为 created。 */
export function createAgentRunRecord(input: {
  agentRunId: string;
  threadId: string;
  taskId: string;
  role: AgentRunRuntimeRole;
  spawnReason: string;
  resumeToken?: string;
}): AgentRunRecord {
  return {
    agentRunId: sharedAgentRunId(input.agentRunId),
    threadId: sharedThreadId(input.threadId),
    taskId: sharedTaskId(input.taskId),
    role: input.role,
    spawnReason: input.spawnReason,
    status: "created",
    resumeToken: input.resumeToken,
  };
}

/** 依据有限状态机推进 AgentRunRecord 生命周期。 */
export function transitionAgentRun(
  agentRun: AgentRunRecord,
  status: AgentRunStatus,
  metadata: {
    startedAt?: string;
    endedAt?: string;
    resumeToken?: string | undefined;
  } = {},
): AgentRunRecord {
  if (agentRun.status !== status) {
    const allowedStatuses = allowedAgentRunTransitions[agentRun.status] ?? [];
    if (!allowedStatuses.includes(status)) {
      throw domainError(`invalid agent run transition from ${agentRun.status} to ${status}`);
    }
  }

  const hasResumeTokenOverride = Object.prototype.hasOwnProperty.call(metadata, "resumeToken");

  return {
    ...agentRun,
    status,
    startedAt: metadata.startedAt ?? agentRun.startedAt,
    endedAt: metadata.endedAt ?? agentRun.endedAt,
    resumeToken: hasResumeTokenOverride ? metadata.resumeToken : agentRun.resumeToken,
  };
}
