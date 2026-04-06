import { z } from "zod";
import { approvalStatusSchema } from "../../../shared/schemas";

export const approvalViewSchema = z.object({
  approvalRequestId: z.string().min(1),
  threadId: z.string().min(1),
  taskId: z.string().min(1),
  toolCallId: z.string().min(1),
  summary: z.string(),
  risk: z.string(),
  status: approvalStatusSchema,
});

export type ApprovalView = z.infer<typeof approvalViewSchema>;
