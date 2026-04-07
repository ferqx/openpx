import { z } from "zod";

export const threadStatusSchema = z.enum(["active", "idle", "archived"]);
export const sessionStatusSchema = z.enum(["idle", "active", "completed", "waiting_approval", "blocked", "failed", "interrupted"]);
export const runStatusSchema = z.enum(["created", "running", "waiting_approval", "blocked", "completed", "failed", "interrupted"]);
export const runTriggerSchema = z.enum(["user_input", "approval_resume", "interrupt_resume", "system_resume"]);
export const taskStatusSchema = z.enum(["queued", "running", "blocked", "completed", "failed", "cancelled"]);
export const workerStatusSchema = z.enum(["created", "starting", "running", "paused", "completed", "failed", "cancelled"]);
export const approvalStatusSchema = z.enum(["pending", "approved", "rejected", "cancelled"]);
export const memoryNamespaceSchema = z.enum(["thread", "durable", "project"]);

export const idSchema = z.string().min(1);

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
