/** 
 * @module shared/schemas
 * 共享 Zod 模式（schema）定义。
 * 
 * 集中定义各领域实体的状态枚举和校验模式，供 domain 层和
 * protocol 层统一引用，确保运行时类型校验和类型推导的一致性。
 * 
 * 术语对照：thread=协作线，session=会话，run=执行尝试，
 * task=具体步骤，worker=工作单元，approval=审批，
 * namespace=命名空间
 */
import { z } from "zod";

/** 协作线状态模式：active=活跃，idle=空闲，archived=已归档 */
export const threadStatusSchema = z.enum(["active", "idle", "archived"]);
/** 会话状态模式 */
export const sessionStatusSchema = z.enum(["idle", "active", "completed", "waiting_approval", "blocked", "failed", "interrupted"]);
/** 执行尝试状态模式 */
export const runStatusSchema = z.enum(["created", "running", "waiting_approval", "blocked", "completed", "failed", "interrupted"]);
/** 执行尝试触发方式模式：user_input=用户输入，approval_resume=审批恢复，interrupt_resume=中断恢复，system_resume=系统恢复 */
export const runTriggerSchema = z.enum(["user_input", "approval_resume", "interrupt_resume", "system_resume"]);
/** 具体步骤状态模式 */
export const taskStatusSchema = z.enum(["queued", "running", "blocked", "completed", "failed", "cancelled"]);
/** 工作单元状态模式 */
export const workerStatusSchema = z.enum(["created", "starting", "running", "paused", "completed", "failed", "cancelled"]);
/** 审批状态模式：pending=待审批，approved=已批准，rejected=已拒绝，cancelled=已取消 */
export const approvalStatusSchema = z.enum(["pending", "approved", "rejected", "cancelled"]);
/** 记忆命名空间模式：thread=协作线级，durable=持久级，project=项目级 */
export const memoryNamespaceSchema = z.enum(["thread", "durable", "project"]);

/** 通用 ID 校验模式——非空字符串 */
export const idSchema = z.string().min(1);

/** 审批请求完整校验模式 */
export const approvalRequestSchema = z.object({
  approvalRequestId: idSchema,
  threadId: idSchema,
  runId: idSchema,
  taskId: idSchema,
  toolCallId: idSchema,
  summary: z.string(),
  risk: z.string(),
  status: approvalStatusSchema,
});
