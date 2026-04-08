import { z } from "zod";
import { runStatusSchema, runTriggerSchema } from "../../../shared/schemas";

export const runBlockingReasonSchema = z.object({
  kind: z.enum(["waiting_approval", "human_recovery", "environment_block"]),
  message: z.string(),
});

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
