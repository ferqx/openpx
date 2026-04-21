import { z } from "zod";
import type { AgentRunRecord } from "../../../domain/agent-run";
import { mapAgentRunRuntimeRoleToAgentRunRole } from "../../../control/agents/agent-run-adapter";
import { agentRunStatusSchema } from "../../../shared/schemas";

export const agentRunRoleKindSchema = z.enum(["primary", "subagent", "system", "legacy_internal"]);
export const agentRunVisibilityPolicySchema = z.enum(["hidden", "visible_when_instance"]);
export const agentRunRuntimeRoleSchema = z.enum(["planner", "executor", "verifier", "memory_maintainer"]);
export const agentRunViewStatusSchema = agentRunStatusSchema;

const agentRunRecordSchema = z.object({
  agentRunId: z.string().min(1),
  threadId: z.string().min(1),
  taskId: z.string().min(1),
  role: agentRunRuntimeRoleSchema,
  status: agentRunViewStatusSchema,
  spawnReason: z.string(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  resumeToken: z.string().optional(),
});

/** AgentRunView：surface 可消费的正式运行实例视图。 */
export const agentRunViewSchema = z.object({
  agentRunId: z.string().min(1),
  threadId: z.string().min(1),
  taskId: z.string().min(1),
  roleKind: agentRunRoleKindSchema,
  roleId: z.string().min(1),
  status: agentRunViewStatusSchema,
  spawnReason: z.string(),
  goalSummary: z.string(),
  inputSummary: z.string().optional(),
  outputSummary: z.string().optional(),
  visibilityPolicy: agentRunVisibilityPolicySchema,
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  resumeToken: z.string().optional(),
});

export type AgentRunView = z.infer<typeof agentRunViewSchema>;

/** 把底层 AgentRunRecord 投影为 AgentRunView。 */
export function toAgentRunView(agentRunRecord: AgentRunRecord): AgentRunView {
  const parsedAgentRun = agentRunRecordSchema.parse(agentRunRecord);
  const role = mapAgentRunRuntimeRoleToAgentRunRole(parsedAgentRun.role);

  return {
    agentRunId: parsedAgentRun.agentRunId,
    threadId: parsedAgentRun.threadId,
    taskId: parsedAgentRun.taskId,
    roleKind: role.roleKind,
    roleId: role.roleId,
    status: parsedAgentRun.status,
    spawnReason: parsedAgentRun.spawnReason,
    goalSummary: parsedAgentRun.spawnReason,
    visibilityPolicy: role.visibilityPolicy,
    ...(parsedAgentRun.resumeToken ? { resumeToken: parsedAgentRun.resumeToken } : {}),
    ...(parsedAgentRun.startedAt ? { startedAt: parsedAgentRun.startedAt } : {}),
    ...(parsedAgentRun.endedAt ? { endedAt: parsedAgentRun.endedAt } : {}),
  };
}
