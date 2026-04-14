import { z } from "zod";
import { taskStatusSchema } from "../../../shared/schemas";
import { blockingReasonKindSchema } from "./thread-view";

/** TaskView 中允许暴露给客户端的阻塞原因 */
export const taskBlockingReasonSchema = z.object({
  kind: blockingReasonKindSchema,
  message: z.string(),
});

/** TaskView：客户端可见的 task 视图 */
export const taskViewSchema = z.object({
  taskId: z.string().min(1),
  threadId: z.string().min(1),
  runId: z.string().min(1),
  status: taskStatusSchema,
  summary: z.string(),
  blockingReason: taskBlockingReasonSchema.optional(),
});

export type TaskView = z.infer<typeof taskViewSchema>;
