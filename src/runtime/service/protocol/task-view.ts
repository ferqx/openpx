import { z } from "zod";
import { taskStatusSchema } from "../../../shared/schemas";
import { blockingReasonKindSchema } from "./thread-view";

export const taskBlockingReasonSchema = z.object({
  kind: blockingReasonKindSchema,
  message: z.string(),
});

export const taskViewSchema = z.object({
  taskId: z.string().min(1),
  threadId: z.string().min(1),
  status: taskStatusSchema,
  summary: z.string(),
  blockingReason: taskBlockingReasonSchema.optional(),
});

export type TaskView = z.infer<typeof taskViewSchema>;
