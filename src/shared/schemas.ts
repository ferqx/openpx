import { z } from "zod";

export const threadStatusSchema = z.enum(["idle", "active", "waiting_approval", "interrupted", "completed", "failed"]);
export const taskStatusSchema = z.enum(["queued", "running", "blocked", "completed", "failed", "cancelled"]);
export const workerStatusSchema = z.enum(["created", "starting", "running", "stopping", "exited", "failed"]);
export const approvalStatusSchema = z.enum(["pending", "approved", "rejected", "cancelled"]);

export const idSchema = z.string().min(1);

export const approvalRequestSchema = z.object({
  approvalRequestId: idSchema,
  threadId: idSchema,
  taskId: idSchema,
  toolCallId: idSchema,
  summary: z.string(),
  risk: z.string(),
  status: approvalStatusSchema,
});
