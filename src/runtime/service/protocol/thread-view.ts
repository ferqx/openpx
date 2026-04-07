import { z } from "zod";
import { runStatusSchema, threadStatusSchema } from "../../../shared/schemas";

export const blockingReasonKindSchema = z.enum(["waiting_approval", "human_recovery"]);

export const threadViewSchema = z.object({
  threadId: z.string().min(1),
  workspaceRoot: z.string(),
  projectId: z.string(),
  revision: z.number().int().nonnegative(),
  status: threadStatusSchema,
  activeRunId: z.string().min(1).optional(),
  activeRunStatus: runStatusSchema.optional(),
  narrativeSummary: z.string().optional(),
  narrativeRevision: z.number().int().nonnegative().optional(),
  pendingApprovalCount: z.number().int().nonnegative().optional(),
  blockingReasonKind: blockingReasonKindSchema.optional(),
});

export type ThreadView = z.infer<typeof threadViewSchema>;
