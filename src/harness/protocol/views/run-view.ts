import { z } from "zod";
import { runStatusSchema, runTriggerSchema } from "../../../shared/schemas";

/** RunView 中允许暴露给客户端的阻塞原因 */
export const runBlockingReasonSchema = z.object({
  kind: z.enum(["waiting_approval", "plan_decision", "human_recovery", "environment_block"]),
  message: z.string(),
});

/** RunView：客户端可见的执行尝试视图 */
export const runViewSchema = z.object({
  runId: z.string().min(1),
  threadId: z.string().min(1),
  status: runStatusSchema,
  trigger: runTriggerSchema,
  inputText: z.string().optional(),
  activeTaskId: z.string().min(1).optional(),
  startedAt: z.string().min(1),
  endedAt: z.string().min(1).optional(),
  resultSummary: z.string().optional(),
  blockingReason: runBlockingReasonSchema.optional(),
  resumeToken: z.string().min(1).optional(),
});

export type RunView = z.infer<typeof runViewSchema>;
