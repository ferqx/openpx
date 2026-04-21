import type {
  AgentRun,
  AgentRunRecord,
  AgentRunRoleKind,
  AgentRunRuntimeRole,
  AgentRunVisibilityPolicy,
} from "../../domain/agent-run";

export type AgentRunRoleProjection = {
  roleKind: AgentRunRoleKind;
  roleId: string;
  visibilityPolicy: AgentRunVisibilityPolicy;
};

/** 把底层 runtime role 投影到正式 AgentRun 协作语义。 */
export function mapAgentRunRuntimeRoleToAgentRunRole(role: AgentRunRuntimeRole): AgentRunRoleProjection {
  switch (role) {
    case "executor":
      return {
        roleKind: "primary",
        roleId: "build",
        visibilityPolicy: "visible_when_instance",
      };
    case "verifier":
      return {
        roleKind: "subagent",
        roleId: "verify",
        visibilityPolicy: "visible_when_instance",
      };
    case "memory_maintainer":
      return {
        roleKind: "system",
        roleId: "memory_maintainer",
        visibilityPolicy: "hidden",
      };
    case "planner":
      return {
        roleKind: "legacy_internal",
        roleId: "planner",
        visibilityPolicy: "hidden",
      };
  }
}

/** 把底层 AgentRunRecord 投影为正式 AgentRun 视图。 */
export function toAgentRun(agentRunRecord: AgentRunRecord): AgentRun {
  const role = mapAgentRunRuntimeRoleToAgentRunRole(agentRunRecord.role);

  return {
    agentRunId: agentRunRecord.agentRunId,
    threadId: agentRunRecord.threadId,
    taskId: agentRunRecord.taskId,
    roleKind: role.roleKind,
    roleId: role.roleId,
    status: agentRunRecord.status,
    spawnReason: agentRunRecord.spawnReason,
    goalSummary: agentRunRecord.spawnReason,
    visibilityPolicy: role.visibilityPolicy,
    ...(agentRunRecord.resumeToken ? { resumeToken: agentRunRecord.resumeToken } : {}),
    ...(agentRunRecord.startedAt ? { startedAt: agentRunRecord.startedAt } : {}),
    ...(agentRunRecord.endedAt ? { endedAt: agentRunRecord.endedAt } : {}),
  };
}
