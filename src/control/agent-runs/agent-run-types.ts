import {
  createAgentRunRecord,
  transitionAgentRun,
  type AgentRunRecord,
  type AgentRunRuntimeRole,
  type AgentRunStatus,
} from "../../domain/agent-run";

export {
  createAgentRunRecord,
  transitionAgentRun,
  type AgentRunRecord,
  type AgentRunRuntimeRole,
  type AgentRunStatus,
};

/** 创建 AgentRun 时的最小输入。 */
export type SpawnAgentRunInput = {
  role: AgentRunRuntimeRole;
  taskId: string;
  threadId: string;
  spawnReason: string;
  resumeToken?: string;
};

/** 从领域 AgentRun 派生可持久化记录，允许在恢复或测试场景回填状态字段。 */
export function createStoredAgentRunRecord(input: {
  agentRunId: string;
  taskId: string;
  threadId: string;
  role: AgentRunRuntimeRole;
  spawnReason: string;
  status?: AgentRunStatus;
  startedAt?: string;
  endedAt?: string;
  resumeToken?: string;
}): AgentRunRecord {
  const created = createAgentRunRecord({
    agentRunId: input.agentRunId,
    taskId: input.taskId,
    threadId: input.threadId,
    role: input.role,
    spawnReason: input.spawnReason,
    resumeToken: input.resumeToken,
  });

  if (!input.status || input.status === "created") {
    // created 态直接返回基础记录，不走状态迁移。
    return {
      ...created,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
    };
  }

  return transitionAgentRun(created, input.status, {
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    resumeToken: input.resumeToken,
  });
}
